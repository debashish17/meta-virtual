import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { DEMO_QUESTIONS } from "@office/shared";
import { afterEach, describe, expect, it } from "vitest";
import { buildDeps } from "../deps.js";
import { loadEnv } from "../env.js";
import { StubBus } from "../room/bus.js";
import { httpRoutes } from "./routes.js";

// People read room names, never zone ids: "Meeting in Acme room", not "Meeting in acme_room"
// (owner, 2026-11-04), in My day and in the office's answers.

const MAYA = { Authorization: "Bearer dev:Maya", "Content-Type": "application/json" };

const servers: Server[] = [];
afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop()!;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

async function boot(): Promise<string> {
  const deps = buildDeps(loadEnv({}));
  deps.bus = new StubBus();
  const app = express();
  app.use(express.json());
  httpRoutes(app, deps);
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("room names after a meeting", () => {
  it("My day names the meeting's room", async () => {
    const base = await boot();
    const made = await fetch(`${base}/meetings`, {
      method: "POST",
      headers: MAYA,
      body: JSON.stringify({ zoneId: "acme_room", fixture: "acme-sync" }),
    });
    expect(made.status).toBe(201);
    const day = (await (await fetch(`${base}/me/day`, { headers: MAYA })).json()) as {
      items: { kind: string; title: string }[];
    };
    const meetings = day.items.filter((item) => item.kind === "meeting");
    expect(meetings.length).toBeGreaterThan(0);
    for (const item of meetings) {
      expect(item.title).toBe("Meeting in Acme room");
    }
  });

  it("the office's answer never shows a zone id", async () => {
    const base = await boot();
    await fetch(`${base}/meetings`, {
      method: "POST",
      headers: MAYA,
      body: JSON.stringify({ zoneId: "acme_room", fixture: "acme-sync" }),
    });
    const res = await fetch(`${base}/ask`, {
      method: "POST",
      headers: MAYA,
      body: JSON.stringify({ question: DEMO_QUESTIONS[0]!.question }),
    });
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("acme_room");
  });
});
