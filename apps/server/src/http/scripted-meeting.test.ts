import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { MeetingProcessResult } from "@office/shared";
import { afterEach, describe, expect, it } from "vitest";
import { buildDeps } from "../deps.js";
import { loadEnv } from "../env.js";
import type { LlmClient } from "../llm/types.js";
import { StubBus } from "../room/bus.js";
import { httpRoutes } from "./routes.js";

// Owner decision 4 (2026-11-04): the scripted demo meeting ("fixture": "acme-sync") always
// extracts through the deterministic FixtureLlm, even when a live model is configured, so the
// demo's changes and its "Acme sync" receipt never vary run to run. Real transcripts and Ask
// keep the configured client.

const MAYA = { Authorization: "Bearer dev:Maya", "Content-Type": "application/json" };

/** Stands in for the live model: records every call, answers like a model that abstains. */
class LiveSpy implements LlmClient {
  extractCalls = 0;
  answerCalls = 0;
  async extractMeeting(): Promise<unknown> {
    this.extractCalls += 1;
    return { summary: "Live model summary", decisions: [], tasks: [], commitments: [], milestoneChanges: [] };
  }
  async answer(): Promise<unknown> {
    this.answerCalls += 1;
    return { answer: "I don't have a record of that.", sources: [] };
  }
}

const servers: Server[] = [];
afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop()!;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

async function boot(): Promise<{ live: LiveSpy; base: string }> {
  const deps = buildDeps(loadEnv({}));
  const live = new LiveSpy();
  deps.llm = live;
  deps.bus = new StubBus();
  const app = express();
  app.use(express.json());
  httpRoutes(app, deps);
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return { live, base: `http://127.0.0.1:${port}` };
}

async function summaryOf(base: string, meetingId: string): Promise<string> {
  const res = await fetch(`${base}/meetings/${meetingId}`, { headers: MAYA });
  expect(res.status).toBe(200);
  return ((await res.json()) as { summary: string }).summary;
}

async function postMeeting(base: string, body: unknown): Promise<MeetingProcessResult> {
  const res = await fetch(`${base}/meetings`, { method: "POST", headers: MAYA, body: JSON.stringify(body) });
  expect(res.status).toBe(201);
  return (await res.json()) as MeetingProcessResult;
}

describe("the scripted demo meeting with a live model configured", () => {
  it("extracts the acme-sync fixture deterministically, never through the live model", async () => {
    const { live, base } = await boot();
    const result = await postMeeting(base, { zoneId: "acme_room", fixture: "acme-sync" });
    expect(live.extractCalls).toBe(0);
    expect((await summaryOf(base, result.meetingId)).startsWith("Acme sync:")).toBe(true);
    expect(result.proposedChanges.map((change) => change.type).sort()).toEqual(
      ["commitment_update", "milestone_date", "task_create", "task_reassign"].sort(),
    );
  });

  it("still sends a real transcript to the live model", async () => {
    const { live, base } = await boot();
    const result = await postMeeting(base, {
      zoneId: "acme_room",
      transcript: "Maya: we talked about the onboarding guide and nothing else changed.",
    });
    expect(live.extractCalls).toBe(1);
    expect(await summaryOf(base, result.meetingId)).toBe("Live model summary");
  });

  it("still answers Ask through the live model", async () => {
    const { live, base } = await boot();
    const res = await fetch(`${base}/ask`, {
      method: "POST",
      headers: MAYA,
      body: JSON.stringify({ question: "What's the status of the Acme integration?" }),
    });
    expect(res.status).toBe(200);
    expect(live.answerCalls).toBeGreaterThan(0);
  });
});
