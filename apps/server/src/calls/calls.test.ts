import { randomBytes } from "node:crypto";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WORKSPACE_ID } from "@office/shared";
import { TokenVerifier } from "livekit-server-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { buildDeps, type Deps } from "../deps.js";
import { loadEnv } from "../env.js";
import { UserRateLimiter } from "../http/rateLimit.js";
import { httpRoutes } from "../http/routes.js";
import type { OfficeRoom } from "../room/office.room.js";
import { registerRoom, unregisterRoom } from "../room/rooms.js";

const MAYA = { Authorization: "Bearer dev:Maya" };

const servers: Server[] = [];
afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop()!;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

interface LiveStack {
  deps: Deps;
  base: string;
  apiKey: string;
  apiSecret: string;
}

/** The HTTP stack with generated test-only LiveKit credentials (never real keys). */
async function bootLive(
  options: { limiter?: UserRateLimiter } = {},
): Promise<LiveStack> {
  const apiKey = `test-key-${randomBytes(4).toString("hex")}`;
  const apiSecret = randomBytes(32).toString("base64");
  const deps = buildDeps(
    loadEnv({
      LIVEKIT_URL: "https://calls.example.test",
      LIVEKIT_API_KEY: apiKey,
      LIVEKIT_API_SECRET: apiSecret,
    }),
  );
  const app = express();
  app.use(express.json());
  httpRoutes(app, deps, options);
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return { deps, base: `http://127.0.0.1:${port}`, apiKey, apiSecret };
}

async function bootOff(): Promise<{ base: string }> {
  const deps = buildDeps(loadEnv({}));
  const app = express();
  app.use(express.json());
  httpRoutes(app, deps);
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}` };
}

/** A stub live room with the given players, in the real registry; removed after the test. */
const cleanups: OfficeRoom[] = [];
afterEach(() => {
  while (cleanups.length > 0) {
    unregisterRoom(WORKSPACE_ID, cleanups.pop()!);
  }
});

function withRoom(players: { userId: string; zoneId: string }[]): void {
  const room = { state: { players: new Map(players.map((p, i) => [`s${i}`, p])) } };
  const stub = room as unknown as OfficeRoom;
  registerRoom(WORKSPACE_ID, stub);
  cleanups.push(stub);
}

async function tokenFor(
  base: string,
  zoneId: string,
  headers: Record<string, string> = MAYA,
): Promise<Response> {
  return fetch(`${base}/calls/token`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ zoneId }),
  });
}

describe("POST /calls/token", () => {
  it("issues a token scoped to the caller's room when they are in it", async () => {
    const { base, apiKey, apiSecret } = await bootLive();
    withRoom([{ userId: "dev-maya", zoneId: "acme_room" }]);
    const res = await tokenFor(base, "acme_room");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; token: string };
    expect(body.url).toBe("https://calls.example.test");
    const grants = await new TokenVerifier(apiKey, apiSecret).verify(body.token);
    expect(grants.sub).toBe("dev-maya");
    expect(grants.name).toBe("Maya");
    expect(grants.video).toMatchObject({
      roomJoin: true,
      room: `${WORKSPACE_ID}--acme_room`,
      canPublish: true,
      canSubscribe: true,
    });
  });

  it("gives 403 for another zone, the open plan, or not connected", async () => {
    const { base } = await bootLive();
    // In meeting_a, asking for the Acme room: the client's claim is not trusted.
    withRoom([{ userId: "dev-maya", zoneId: "meeting_a" }]);
    expect(await (await tokenFor(base, "acme_room")).status).toBe(403);
    // In the open plan, asking for it: not a callable zone.
    withRoom([{ userId: "dev-maya", zoneId: "library" }]);
    expect(await (await tokenFor(base, "library")).status).toBe(403);
  });

  it("gives 403 when the caller is not connected to the office", async () => {
    const { base } = await bootLive();
    withRoom([{ userId: "dev-arjun", zoneId: "acme_room" }]);
    expect(await (await tokenFor(base, "acme_room")).status).toBe(403);
  });

  it("gives 403 when nobody is online", async () => {
    const { base } = await bootLive();
    expect(await (await tokenFor(base, "acme_room")).status).toBe(403);
  });

  it("gives 503 calls_off without LiveKit keys, and the office is unaffected", async () => {
    const { base } = await bootOff();
    withRoom([{ userId: "dev-maya", zoneId: "acme_room" }]);
    const res = await tokenFor(base, "acme_room");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "calls_off" });
    // Everything else still answers.
    expect(await (await fetch(`${base}/health`)).status).toBe(200);
    expect(await (await fetch(`${base}/me/day`, { headers: MAYA })).status).toBe(200);
  });

  it("validates auth and the body like every other endpoint", async () => {
    const { base } = await bootLive();
    withRoom([{ userId: "dev-maya", zoneId: "acme_room" }]);
    expect(await (await tokenFor(base, "acme_room", {})).status).toBe(401);
    for (const body of ["{}", '{"zoneId":123}', '{"zoneId":"acme_room","room":"other"}']) {
      const bad = await fetch(`${base}/calls/token`, {
        method: "POST",
        headers: { ...MAYA, "Content-Type": "application/json" },
        body,
      });
      expect(bad.status).toBe(400);
    }
  });

  it("is rate-limited per user", async () => {
    const { base } = await bootLive({ limiter: new UserRateLimiter({ windowMs: 60_000, max: 1 }) });
    withRoom([{ userId: "dev-maya", zoneId: "acme_room" }]);
    expect(await (await tokenFor(base, "acme_room")).status).toBe(200);
    expect(await (await tokenFor(base, "acme_room")).status).toBe(429);
  });
});

describe("GET /health calls field", () => {
  it("reports calls off without keys and on with them", async () => {
    const off = await bootOff();
    expect(await (await fetch(`${off.base}/health`)).json()).toMatchObject({ calls: "off" });
    const on = await bootLive();
    expect(await (await fetch(`${on.base}/health`)).json()).toMatchObject({ calls: "on" });
  });
});
