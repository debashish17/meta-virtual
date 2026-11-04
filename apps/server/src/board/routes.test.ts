import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { BoardPin, BoardPinList } from "@office/shared";
import { afterEach, describe, expect, it } from "vitest";
import { buildDeps } from "../deps.js";
import { loadEnv } from "../env.js";
import { httpRoutes } from "../http/routes.js";
import { StubBus } from "../room/bus.js";

/** `dev:<name>` access tokens, built up so no credential-shaped literal sits in source. */
const as = (name: string) => ({ Authorization: ["Bearer", `dev:${name}`].join(" ") });
const MAYA = as("Maya");
const ARJUN = as("Arjun");

const SHIP_IT = { text: "Ship it", color: "pink" };
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

const servers: Server[] = [];
afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop()!;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

async function boot(): Promise<{ base: string; bus: StubBus }> {
  const bus = new StubBus();
  const app = express();
  app.use(express.json());
  httpRoutes(app, { ...buildDeps(loadEnv({})), bus });
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, bus };
}

async function createPin(base: string, auth: Record<string, string>, body: unknown) {
  return fetch(`${base}/board`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("board routes", () => {
  it("needs a valid access token", async () => {
    const { base } = await boot();
    expect(await (await fetch(`${base}/board`)).status).toBe(401);
  });

  it("pins, lists and removes, broadcasting board on every write", async () => {
    const { base, bus } = await boot();
    const created = await createPin(base, MAYA, SHIP_IT);
    expect(created.status).toBe(201);
    const pin = BoardPin.parse(await created.json());
    expect(pin).toMatchObject({
      authorName: "Maya",
      text: "Ship it",
      color: "pink",
    });

    const list = BoardPinList.parse(
      await (await fetch(`${base}/board`, { headers: ARJUN })).json(),
    );
    expect(list.pins.map((item) => item.id)).toEqual([pin.id]);

    const deleted = await fetch(`${base}/board/${pin.id}`, {
      method: "DELETE",
      headers: MAYA,
    });
    expect(deleted.status).toBe(200);
    const empty = BoardPinList.parse(
      await (await fetch(`${base}/board`, { headers: MAYA })).json(),
    );
    expect(empty.pins).toHaveLength(0);

    expect(bus.calls.map((call) => call.kinds)).toEqual([["board"], ["board"]]);
    expect(bus.invites).toHaveLength(0);
  });

  it("shows Arjun Maya's pins but only Maya removes them", async () => {
    const { base } = await boot();
    const pin = BoardPin.parse(await (await createPin(base, MAYA, SHIP_IT)).json());

    const arjuns = BoardPinList.parse(
      await (await fetch(`${base}/board`, { headers: ARJUN })).json(),
    );
    expect(arjuns.pins.map((item) => item.id)).toContain(pin.id);

    const deleted = await fetch(`${base}/board/${pin.id}`, {
      method: "DELETE",
      headers: ARJUN,
    });
    expect(deleted.status).toBe(403);

    const mayas = BoardPinList.parse(
      await (await fetch(`${base}/board`, { headers: MAYA })).json(),
    );
    expect(mayas.pins).toMatchObject([{ id: pin.id, text: "Ship it" }]);
  });

  it("answers 400 for bodies outside the shared schemas", async () => {
    const { base } = await boot();
    expect((await createPin(base, MAYA, { color: "pink" })).status).toBe(400);
    expect((await createPin(base, MAYA, { text: "  ", color: "pink" })).status).toBe(400);
    expect((await createPin(base, MAYA, { text: "Ship it", color: "" })).status).toBe(400);
    expect((await createPin(base, MAYA, { ...SHIP_IT, extra: 1 })).status).toBe(400);
    expect(
      (await createPin(base, MAYA, { ...SHIP_IT, authorName: "Arjun" })).status,
    ).toBe(400);
  });

  it("answers 400 for a bad id and 404 for an unknown pin", async () => {
    const { base } = await boot();
    const bad = await fetch(`${base}/board/not-a-uuid`, {
      method: "DELETE",
      headers: MAYA,
    });
    expect(bad.status).toBe(400);
    const missing = await fetch(`${base}/board/${UNKNOWN_ID}`, {
      method: "DELETE",
      headers: MAYA,
    });
    expect(missing.status).toBe(404);
  });
});
