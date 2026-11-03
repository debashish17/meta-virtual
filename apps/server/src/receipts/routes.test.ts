import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  DEMO_ACCOUNT,
  ReceiptList,
  type MeetingProcessResult,
  type ProposedChangeList,
} from "@office/shared";
import { afterEach, describe, expect, it } from "vitest";
import { buildDeps } from "../deps.js";
import { loadEnv } from "../env.js";
import { httpRoutes } from "../http/routes.js";

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

async function boot(): Promise<string> {
  const deps = buildDeps(loadEnv({}));
  const app = express();
  app.use(express.json());
  httpRoutes(app, deps);
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

async function processFixture(base: string): Promise<MeetingProcessResult> {
  const res = await fetch(`${base}/meetings`, {
    method: "POST",
    headers: { ...MAYA, "Content-Type": "application/json" },
    body: JSON.stringify({ zoneId: "acme_room", fixture: "acme-sync" }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as MeetingProcessResult;
}

async function decide(base: string, id: string, decision: "approve" | "reject"): Promise<void> {
  const res = await fetch(`${base}/proposed-changes/${id}/${decision}`, {
    method: "POST",
    headers: MAYA,
  });
  expect(res.status).toBe(200);
}

describe("GET /receipts", () => {
  it("needs a valid access token", async () => {
    const base = await boot();
    expect(await (await fetch(`${base}/receipts`)).status).toBe(401);
  });

  it("reads empty before anything is decided", async () => {
    const base = await boot();
    await processFixture(base);
    const res = await fetch(`${base}/receipts`, { headers: MAYA });
    expect(res.status).toBe(200);
    expect(ReceiptList.parse(await res.json())).toEqual({ receipts: [] });
  });

  it("returns one receipt per decided change, newest first", async () => {
    const base = await boot();
    await processFixture(base);
    const pending = (await (
      await fetch(`${base}/proposed-changes?status=pending`, { headers: MAYA })
    ).json()) as ProposedChangeList;
    const milestone = pending.changes.find((c) => c.type === "milestone_date")!;
    const reassign = pending.changes.find((c) => c.type === "task_reassign")!;
    await decide(base, milestone.id, "approve");
    await decide(base, reassign.id, "reject");

    const res = await fetch(`${base}/receipts`, { headers: MAYA });
    expect(res.status).toBe(200);
    const body = ReceiptList.parse(await res.json());
    expect(body.receipts).toHaveLength(2);
    expect(body.receipts[0]!.decidedAt).toBeGreaterThanOrEqual(body.receipts[1]!.decidedAt);
    expect(body.receipts.find((r) => r.kind === "milestone_date")).toMatchObject({
      recordType: "milestone",
      recordLabel: "Go-live",
      before: { targetDate: "2026-11-15" },
      after: { targetDate: "2026-11-22" },
      meetingLabel: "Acme sync",
      decision: "approved",
      deciderName: "Maya",
    });
    expect(body.receipts.find((r) => r.kind === "task_reassign")).toMatchObject({
      decision: "rejected",
      deciderName: "Maya",
    });
  });

  it("filters by account and by project", async () => {
    const base = await boot();
    await processFixture(base);
    const pending = (await (
      await fetch(`${base}/proposed-changes?status=pending`, { headers: MAYA })
    ).json()) as ProposedChangeList;
    for (const change of pending.changes.filter((c) => c.type !== "task_reassign")) {
      await decide(base, change.id, "approve");
    }
    const kinds = async (query: string): Promise<string[]> => {
      const res = await fetch(`${base}/receipts${query}`, { headers: MAYA });
      expect(res.status).toBe(200);
      return ReceiptList.parse(await res.json()).receipts.map((r) => r.kind);
    };
    expect(await kinds(`?accountId=${DEMO_ACCOUNT.id}`)).toHaveLength(3);
    expect(await kinds("?accountId=00000000-0000-4000-8000-000000000000")).toEqual([]);
    expect(await kinds("?limit=2")).toHaveLength(2);
  });

  it("refuses a bad query with a 400", async () => {
    const base = await boot();
    expect(await (await fetch(`${base}/receipts?accountId=nope`, { headers: MAYA })).status).toBe(
      400,
    );
    expect(await (await fetch(`${base}/receipts?limit=many`, { headers: MAYA })).status).toBe(400);
    expect(await (await fetch(`${base}/receipts?limit=0`, { headers: MAYA })).status).toBe(400);
  });
});
