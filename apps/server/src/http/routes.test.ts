import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  DEMO_ACCOUNT,
  DEMO_MILESTONE,
  DEMO_PROJECT,
  DEMO_QUESTIONS,
  type MeetingProcessResult,
  type ProposedChange,
  type ProposedChangeList,
} from "@office/shared";
import { afterEach, describe, expect, it } from "vitest";
import type { Deps } from "../deps.js";
import { buildDeps } from "../deps.js";
import { loadEnv } from "../env.js";
import { StubBus } from "../room/bus.js";
import { UserRateLimiter } from "./rateLimit.js";
import { httpRoutes } from "./routes.js";

const STATUS_QUESTION = DEMO_QUESTIONS[0]!.question;
const CEO_QUESTION = DEMO_QUESTIONS[1]!.question;
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

async function boot(options: { limiter?: UserRateLimiter } = {}): Promise<{
  deps: Deps;
  bus: StubBus;
  base: string;
}> {
  const deps = buildDeps(loadEnv({}));
  const bus = new StubBus();
  deps.bus = bus;
  const app = express();
  app.use(express.json());
  httpRoutes(app, deps, options);
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return { deps, bus, base: `http://127.0.0.1:${port}` };
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

describe("http routes", () => {
  it("answers /health with the deployed configuration, no auth needed", async () => {
    const { base } = await boot();
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, authMode: "dev", llm: "fixture" });
  });

  it("rejects requests without a valid bearer token", async () => {
    const { base } = await boot();
    expect(await (await fetch(`${base}/me/day`)).status).toBe(401);
    expect(
      await (
        await fetch(`${base}/me/day`, { headers: { Authorization: "Bearer nope" } })
      ).status,
    ).toBe(401);
    expect(
      await (
        await fetch(`${base}/me/day`, { headers: { Authorization: "Basic dev:Maya" } })
      ).status,
    ).toBe(401);
  });

  it("serves my day and the status endpoints", async () => {
    const { base } = await boot();
    const day = (await (await fetch(`${base}/me/day`, { headers: MAYA })).json()) as {
      items: unknown[];
    };
    expect(Array.isArray(day.items)).toBe(true);

    const project = (await (
      await fetch(`${base}/projects/${DEMO_PROJECT.id}/status`, { headers: MAYA })
    ).json()) as { project: { name: string } };
    expect(project.project.name).toBe(DEMO_PROJECT.name);
    expect(await (await fetch(`${base}/projects/not-a-uuid/status`, { headers: MAYA })).status).toBe(
      400,
    );
    expect(
      await (
        await fetch(`${base}/projects/00000000-0000-4000-8000-000000000000/status`, { headers: MAYA })
      ).status,
    ).toBe(404);

    const account = (await (
      await fetch(`${base}/accounts/${DEMO_ACCOUNT.id}/status`, { headers: MAYA })
    ).json()) as { account: { name: string } };
    expect(account.account.name).toBe(DEMO_ACCOUNT.name);
    expect(
      await (
        await fetch(`${base}/accounts/00000000-0000-4000-8000-000000000000/status`, { headers: MAYA })
      ).status,
    ).toBe(404);
  });

  it("processes the fixture meeting into the four expected changes", async () => {
    const { base, bus } = await boot();
    const result = await processFixture(base);
    expect(result.proposedChanges).toHaveLength(4);
    expect(result.proposedChanges.map((change) => change.type).sort()).toEqual([
      "commitment_update",
      "milestone_date",
      "task_create",
      "task_reassign",
    ]);
    for (const change of result.proposedChanges) {
      expect(change.sourceMeetingId).toBe(result.meetingId);
      expect(change.status).toBe("pending");
    }
    expect(bus.calls).toEqual([
      { workspaceId: "northwind-demo", kinds: ["meetings", "proposed_changes"] },
    ]);

    const meeting = (await (
      await fetch(`${base}/meetings/${result.meetingId}`, { headers: MAYA })
    ).json()) as { summary: string; decisions: unknown[] };
    expect(meeting.summary).toContain("22 Nov");
    expect(meeting.decisions.length).toBeGreaterThan(0);
    expect(
      await (
        await fetch(`${base}/meetings/00000000-0000-4000-8000-000000000000`, { headers: MAYA })
      ).status,
    ).toBe(404);
  });

  it("accepts a pasted transcript and rejects bad meeting bodies", async () => {
    const { base } = await boot();
    const res = await fetch(`${base}/meetings`, {
      method: "POST",
      headers: { ...MAYA, "Content-Type": "application/json" },
      body: JSON.stringify({ zoneId: "acme_room", transcript: "Just a hallway chat." }),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as MeetingProcessResult).proposedChanges).toEqual([]);

    for (const body of [{}, { zoneId: "acme_room" }, { zoneId: "acme_room", fixture: "nope" }]) {
      const bad = await fetch(`${base}/meetings`, {
        method: "POST",
        headers: { ...MAYA, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(bad.status).toBe(400);
    }
  });

  it("lists proposed changes with status and meeting filters", async () => {
    const { base } = await boot();
    const result = await processFixture(base);
    const pending = (await (
      await fetch(`${base}/proposed-changes?status=pending`, { headers: MAYA })
    ).json()) as ProposedChangeList;
    expect(pending.changes).toHaveLength(4);
    const byMeeting = (await (
      await fetch(`${base}/proposed-changes?meetingId=${result.meetingId}`, { headers: MAYA })
    ).json()) as ProposedChangeList;
    expect(byMeeting.changes).toHaveLength(4);
    const other = (await (
      await fetch(
        `${base}/proposed-changes?meetingId=00000000-0000-4000-8000-000000000000`,
        { headers: MAYA },
      )
    ).json()) as ProposedChangeList;
    expect(other.changes).toEqual([]);
    expect(
      await (await fetch(`${base}/proposed-changes?status=bogus`, { headers: MAYA })).status,
    ).toBe(400);
  });

  function milestoneChange(changes: ProposedChange[]): ProposedChange {
    const change = changes.find((item) => item.type === "milestone_date");
    if (!change) {
      throw new Error("the fixture must propose a milestone change");
    }
    return change;
  }

  it("approves a change: record updated, audit written, room notified, second approval 409", async () => {
    const { deps, base, bus } = await boot();
    const result = await processFixture(base);
    const change = milestoneChange(result.proposedChanges);

    const approved = await fetch(`${base}/proposed-changes/${change.id}/approve`, {
      method: "POST",
      headers: MAYA,
    });
    expect(approved.status).toBe(200);
    expect(await approved.json()).toEqual({ ok: true });
    expect(bus.calls.at(-1)).toEqual({
      workspaceId: "northwind-demo",
      kinds: ["milestones", "proposed_changes"],
    });

    const project = (await (
      await fetch(`${base}/projects/${DEMO_PROJECT.id}/status`, { headers: MAYA })
    ).json()) as { milestones: { id: string; targetDate: string }[] };
    const milestone = project.milestones.find((item) => item.id === DEMO_MILESTONE.id);
    expect(milestone?.targetDate).toBe("2026-11-22");

    const claims = { userId: "u", name: "U", workspaceId: "northwind-demo" };
    const audit = await deps.repo.audit(claims);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "approve", table: "milestones" });

    const again = await fetch(`${base}/proposed-changes/${change.id}/approve`, {
      method: "POST",
      headers: MAYA,
    });
    expect(again.status).toBe(409);

    const unknown = await fetch(
      `${base}/proposed-changes/00000000-0000-4000-8000-000000000000/approve`,
      { method: "POST", headers: MAYA },
    );
    expect(unknown.status).toBe(404);
  });

  it("rejects a change with an audit row and leaves records unchanged", async () => {
    const { deps, base } = await boot();
    const result = await processFixture(base);
    const change = result.proposedChanges.find((item) => item.type === "task_reassign");
    if (!change?.targetId) {
      throw new Error("the fixture must propose a task update");
    }
    const claims = { userId: "u", name: "U", workspaceId: "northwind-demo" };
    const before = await deps.repo.task(claims, change.targetId);

    const rejected = await fetch(`${base}/proposed-changes/${change.id}/reject`, {
      method: "POST",
      headers: MAYA,
    });
    expect(rejected.status).toBe(200);
    expect(await deps.repo.task(claims, change.targetId)).toEqual(before);
    expect(await deps.repo.audit(claims)).toMatchObject([{ action: "reject" }]);

    const again = await fetch(`${base}/proposed-changes/${change.id}/reject`, {
      method: "POST",
      headers: MAYA,
    });
    expect(again.status).toBe(409);
  });

  it("answers the demo status question with citations, and abstains for the CEO", async () => {
    const { base } = await boot();
    const result = await processFixture(base);
    const approve = await fetch(
      `${base}/proposed-changes/${milestoneChange(result.proposedChanges).id}/approve`,
      { method: "POST", headers: MAYA },
    );
    expect(approve.status).toBe(200);

    const cited = await fetch(`${base}/ask`, {
      method: "POST",
      headers: { ...MAYA, "Content-Type": "application/json" },
      body: JSON.stringify({ question: STATUS_QUESTION }),
    });
    expect(cited.status).toBe(200);
    const answer = (await cited.json()) as { answer: string; abstained: boolean; sources: unknown[] };
    expect(answer.abstained).toBe(false);
    expect(answer.sources.length).toBeGreaterThan(0);
    expect(answer.answer).toContain("2026-11-22");

    const ceo = await fetch(`${base}/ask`, {
      method: "POST",
      headers: { ...MAYA, "Content-Type": "application/json" },
      body: JSON.stringify({ question: CEO_QUESTION }),
    });
    expect(ceo.status).toBe(200);
    expect(await ceo.json()).toEqual({
      answer: "I don't have a record of that.",
      abstained: true,
      sources: [],
    });

    const bad = await fetch(`${base}/ask`, {
      method: "POST",
      headers: { ...MAYA, "Content-Type": "application/json" },
      body: JSON.stringify({ question: "  " }),
    });
    expect(bad.status).toBe(400);
  });

  it("rate-limits each user separately", async () => {
    const { base } = await boot({ limiter: new UserRateLimiter({ windowMs: 60_000, max: 2 }) });
    expect(await (await fetch(`${base}/me/day`, { headers: MAYA })).status).toBe(200);
    expect(await (await fetch(`${base}/me/day`, { headers: MAYA })).status).toBe(200);
    const limited = await fetch(`${base}/me/day`, { headers: MAYA });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect(
      await (await fetch(`${base}/me/day`, { headers: { Authorization: "Bearer dev:Arjun" } })).status,
    ).toBe(200);
  });

  it("runs the P6 lane middleware only for lane prefixes", async () => {
    let checks = 0;
    const limiter = new UserRateLimiter();
    const check = limiter.check.bind(limiter);
    limiter.check = (key: string) => {
      checks += 1;
      return check(key);
    };
    const { base } = await boot({ limiter });
    // /ask is registered after the pathlessly mounted P6 router: it pays auth+limit once.
    const asked = await fetch(`${base}/ask`, {
      method: "POST",
      headers: { ...MAYA, "Content-Type": "application/json" },
      body: JSON.stringify({ question: STATUS_QUESTION }),
    });
    expect(asked.status).toBe(200);
    expect(checks).toBe(1);
    // Unmatched paths skip the lane middleware: 404, no limit token consumed.
    const missing = await fetch(`${base}/no-such-path`);
    expect(missing.status).toBe(404);
    expect(checks).toBe(1);
    // Unknown subpaths under lane prefixes are still guarded.
    const laneMissing = await fetch(`${base}/bookings/nope`);
    expect(laneMissing.status).toBe(401);
  });

  it("stores the booking agenda with the meeting", async () => {
    const { base } = await boot();
    const booked = await fetch(`${base}/bookings`, {
      method: "POST",
      headers: { ...MAYA, "Content-Type": "application/json" },
      body: JSON.stringify({
        zoneId: "acme_room",
        title: "Acme sync",
        agenda: "Review the go-live checklist",
        inviteeIds: ["dev-arjun"],
      }),
    });
    expect(booked.status).toBe(201);
    const booking = (await booked.json()) as { id: string };
    const processed = await fetch(`${base}/meetings`, {
      method: "POST",
      headers: { ...MAYA, "Content-Type": "application/json" },
      body: JSON.stringify({ zoneId: "acme_room", fixture: "acme-sync", bookingId: booking.id }),
    });
    expect(processed.status).toBe(201);
    const result = (await processed.json()) as { meetingId: string };
    const meeting = (await (
      await fetch(`${base}/meetings/${result.meetingId}`, { headers: MAYA })
    ).json()) as { agenda?: string };
    expect(meeting.agenda).toBe("Review the go-live checklist");
    // An unknown booking, or one for another room, is a 400.
    const unknown = await fetch(`${base}/meetings`, {
      method: "POST",
      headers: { ...MAYA, "Content-Type": "application/json" },
      body: JSON.stringify({
        zoneId: "acme_room",
        fixture: "acme-sync",
        bookingId: "00000000-0000-0000-0000-000000000000",
      }),
    });
    expect(unknown.status).toBe(400);
    const otherRoom = await fetch(`${base}/meetings`, {
      method: "POST",
      headers: { ...MAYA, "Content-Type": "application/json" },
      body: JSON.stringify({ zoneId: "project_room", fixture: "acme-sync", bookingId: booking.id }),
    });
    expect(otherRoom.status).toBe(400);
  });
});
