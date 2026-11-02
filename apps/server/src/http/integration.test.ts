import { createClient } from "@supabase/supabase-js";
import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  DEMO_QUESTIONS,
  type AuthClaims,
  type MeetingProcessResult,
  type ProposedChange,
  type ProposedChangeList,
} from "@office/shared";
import postgres, { type Sql } from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fixtureAnswer } from "../ask/index.js";
import type { AuthVerifier } from "../auth/verify.js";
import { UnauthorizedError } from "../auth/verify.js";
import { localSupabase } from "../db/local.js";
import { createPostgresRepo, PostgresRepo } from "../db/postgres.js";
import type { Repo } from "../db/repo.js";
import { buildDeps, type Deps } from "../deps.js";
import { loadEnv } from "../env.js";
import { DatabaseChatStore } from "./chatStore.js";
import { createLlm } from "../llm/factory.js";
import { StubBus } from "../room/bus.js";
import { httpRoutes } from "./routes.js";

vi.setConfig({ testTimeout: 60_000 });

const STATUS_QUESTION = DEMO_QUESTIONS[0]!.question;
const CEO_QUESTION = DEMO_QUESTIONS[1]!.question;

/** Null when local Supabase is not reachable: the suite skips instead of failing. */
async function probeDatabase(): Promise<string | null> {
  let databaseUrl: string;
  try {
    databaseUrl = localSupabase().databaseUrl;
  } catch {
    return null;
  }
  const sql = postgres(databaseUrl, { connect_timeout: 5, max: 1 });
  try {
    await sql`SELECT 1`;
    return databaseUrl;
  } catch {
    return null;
  } finally {
    await sql.end();
  }
}

const DATABASE_URL = await probeDatabase();

describe.runIf(DATABASE_URL === null)("HTTP API over Postgres (skipped)", () => {
  it("needs local Supabase", () => {
    console.warn("[db] skipping: local Supabase is not reachable (`pnpm db:start`)");
  });
});

describe.runIf(DATABASE_URL !== null)("HTTP API over Postgres", () => {
  let repo: PostgresRepo;
  let admin: Sql;
  const workspaces: string[] = [];
  const users: string[] = [];
  const servers: Server[] = [];

  interface Fixture {
    workspaceId: string;
    userId: string;
    claims: AuthClaims;
    auth: string;
    accountId: string;
    projectId: string;
    milestoneId: string;
    taskId: string;
    commitmentId: string;
  }

  /** Test tokens carry their claims (`db:<workspace>:<user>:<name>`); anything else is rejected. */
  function stubAuth(): AuthVerifier {
    return {
      verify: async (token: string | undefined): Promise<AuthClaims> => {
        const parts = typeof token === "string" ? token.split(":") : [];
        if (parts.length !== 4 || parts[0] !== "db" || !parts[1] || !parts[2] || !parts[3]) {
          throw new UnauthorizedError("expected a db:<workspace>:<user>:<name> token");
        }
        return { workspaceId: parts[1], userId: parts[2], name: parts[3] };
      },
    };
  }

  async function boot(deps: Deps): Promise<string> {
    const app = express();
    app.use(express.json());
    httpRoutes(app, deps);
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async function makeFixture(tag: string): Promise<Fixture> {
    const workspaceId = `p3b-${tag}-${randomUUID()}`;
    const userId = randomUUID();
    const accountId = randomUUID();
    const projectId = randomUUID();
    const milestoneId = randomUUID();
    const taskId = randomUUID();
    const commitmentId = randomUUID();
    await admin`INSERT INTO workspaces (id, name) VALUES (${workspaceId}, ${tag})`;
    await admin`INSERT INTO memberships (workspace_id, user_id, role)
      VALUES (${workspaceId}, ${userId}, 'member')`;
    await admin`INSERT INTO accounts (id, workspace_id, name, deal_stage, owner_id)
      VALUES (${accountId}, ${workspaceId}, 'Acme Corp', 'Negotiation', ${userId})`;
    await admin`INSERT INTO projects (id, workspace_id, account_id, name, owner_id)
      VALUES (${projectId}, ${workspaceId}, ${accountId}, 'Acme Payments Integration', ${userId})`;
    await admin`INSERT INTO milestones (id, workspace_id, project_id, name, target_date, status)
      VALUES (${milestoneId}, ${workspaceId}, ${projectId}, 'Go-live', '2026-11-15', 'upcoming')`;
    await admin`INSERT INTO tasks (id, workspace_id, project_id, title, owner_id, status)
      VALUES (${taskId}, ${workspaceId}, ${projectId}, 'Fix webhook signature validation',
        ${userId}, 'todo')`;
    await admin`INSERT INTO commitments (id, workspace_id, account_id, text, due_date,
        linked_milestone_id)
      VALUES (${commitmentId}, ${workspaceId}, ${accountId}, 'Go-live by 15 Nov',
        '2026-11-15', ${milestoneId})`;
    workspaces.push(workspaceId);
    const claims: AuthClaims = { userId, name: "Maya", workspaceId };
    return {
      workspaceId,
      userId,
      claims,
      auth: `db:${workspaceId}:${userId}:Maya`,
      accountId,
      projectId,
      milestoneId,
      taskId,
      commitmentId,
    };
  }

  function testDeps(auth: AuthVerifier, target: Repo = repo): Deps {
    const lookup = async () => null;
    return {
      env: loadEnv({}),
      version: "test",
      repo: target,
      llm: createLlm({ answer: fixtureAnswer }),
      auth,
      bus: new StubBus(),
      chat: new DatabaseChatStore(target, lookup),
    };
  }

  function byType(changes: ProposedChange[], type: ProposedChange["type"]): ProposedChange {
    const change = changes.find((item) => item.type === type);
    if (!change) {
      throw new Error(`expected a ${type} change`);
    }
    return change;
  }

  beforeAll(() => {
    repo = createPostgresRepo(DATABASE_URL as string);
    admin = postgres(DATABASE_URL as string, { max: 1 });
  });

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop()!;
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    if (workspaces.length > 0) {
      await admin`DELETE FROM workspaces WHERE id = ANY(${workspaces})`;
      workspaces.length = 0;
    }
    if (users.length > 0) {
      const { supabaseUrl, serviceRoleKey } = localSupabase();
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      for (const id of users) {
        await adminClient.auth.admin.deleteUser(id);
      }
      users.length = 0;
    }
  });

  afterAll(async () => {
    await repo.close();
    await admin.end();
  });

  it("runs the fixture end to end: meeting, approvals, audit, 409", async () => {
    const fx = await makeFixture("flow");
    const base = await boot(testDeps(stubAuth()));
    const headers = { Authorization: `Bearer ${fx.auth}`, "Content-Type": "application/json" };

    // The zone is unscoped on purpose: this workspace uses random ids, so the
    // demo room mapping cannot narrow by id; matching runs by name instead.
    const created = await fetch(`${base}/meetings`, {
      method: "POST",
      headers,
      body: JSON.stringify({ zoneId: "test_room", fixture: "acme-sync" }),
    });
    expect(created.status).toBe(201);
    const result = (await created.json()) as MeetingProcessResult;
    expect(result.proposedChanges.map((change) => change.type).sort()).toEqual([
      "commitment_update",
      "milestone_date",
      "task_create",
      "task_reassign",
    ]);

    const approve = async (id: string): Promise<number> =>
      (
        await fetch(`${base}/proposed-changes/${id}/approve`, { method: "POST", headers })
      ).status;
    expect(await approve(byType(result.proposedChanges, "milestone_date").id)).toBe(200);
    expect(await approve(byType(result.proposedChanges, "commitment_update").id)).toBe(200);
    expect(await approve(byType(result.proposedChanges, "task_create").id)).toBe(200);

    // No profiles exist for this throwaway workspace, so the reassign carries
    // an owner name instead of an id and is rejected, not approved.
    const reassign = byType(result.proposedChanges, "task_reassign");
    expect(reassign.needsReview).toBe(true);
    const rejected = await fetch(`${base}/proposed-changes/${reassign.id}/reject`, {
      method: "POST",
      headers,
    });
    expect(rejected.status).toBe(200);

    expect(await approve(byType(result.proposedChanges, "milestone_date").id)).toBe(409);

    const project = (await (
      await fetch(`${base}/projects/${fx.projectId}/status`, { headers })
    ).json()) as { milestones: { id: string; targetDate: string }[] };
    expect(
      project.milestones.find((item) => item.id === fx.milestoneId)?.targetDate,
    ).toBe("2026-11-22");

    const approved = (await (
      await fetch(`${base}/proposed-changes?status=pending`, { headers })
    ).json()) as ProposedChangeList;
    expect(approved.changes).toEqual([]);

    const audit = await repo.audit(fx.claims);
    expect(audit.map((row) => row.action).sort()).toEqual([
      "approve",
      "approve",
      "approve",
      "reject",
    ]);
    expect(new Set(audit.map((row) => row.table))).toEqual(
      new Set(["milestones", "commitments", "tasks"]),
    );
  });

  it("isolates workspaces over HTTP", async () => {
    const a = await makeFixture("iso-a");
    const b = await makeFixture("iso-b");
    const base = await boot(testDeps(stubAuth()));
    const headersA = { Authorization: `Bearer ${a.auth}` };

    expect(
      await (await fetch(`${base}/projects/${b.projectId}/status`, { headers: headersA })).status,
    ).toBe(404);
    expect(
      await (await fetch(`${base}/accounts/${b.accountId}/status`, { headers: headersA })).status,
    ).toBe(404);
    const changes = (await (
      await fetch(`${base}/proposed-changes`, { headers: headersA })
    ).json()) as ProposedChangeList;
    expect(changes.changes).toEqual([]);
    const day = (await (await fetch(`${base}/me/day`, { headers: headersA })).json()) as {
      items: { id: string }[];
    };
    expect(day.items.some((item) => item.id === b.taskId)).toBe(false);
  });

  it("answers ask with citations after approval, and abstains for the CEO", async () => {
    const fx = await makeFixture("ask");
    const base = await boot(testDeps(stubAuth()));
    const headers = { Authorization: `Bearer ${fx.auth}`, "Content-Type": "application/json" };

    const ask = async (question: string): Promise<{ answer: string; abstained: boolean; sources: unknown[] }> =>
      (await (
        await fetch(`${base}/ask`, { method: "POST", headers, body: JSON.stringify({ question }) })
      ).json()) as { answer: string; abstained: boolean; sources: unknown[] };

    const before = await ask(STATUS_QUESTION);
    expect(before.abstained).toBe(false);
    expect(before.sources.length).toBeGreaterThan(0);

    const ceo = await ask(CEO_QUESTION);
    expect(ceo).toEqual({
      answer: "I don't have a record of that.",
      abstained: true,
      sources: [],
    });

    const created = await fetch(`${base}/meetings`, {
      method: "POST",
      headers,
      body: JSON.stringify({ zoneId: "test_room", fixture: "acme-sync" }),
    });
    const result = (await created.json()) as MeetingProcessResult;
    const approved = await fetch(
      `${base}/proposed-changes/${byType(result.proposedChanges, "milestone_date").id}/approve`,
      { method: "POST", headers },
    );
    expect(approved.status).toBe(200);

    const after = await ask(STATUS_QUESTION);
    expect(after.abstained).toBe(false);
    expect(after.answer).toContain("2026-11-22");
  });

  it("persists chat to chat_messages", async () => {
    const fx = await makeFixture("chat");
    const lookup = async (userId: string) =>
      userId === fx.userId ? { workspaceId: fx.workspaceId, name: "Maya" } : null;
    const store = new DatabaseChatStore(repo, lookup);
    store.add({ id: randomUUID(), userId: fx.userId, name: "Maya", text: "db hello", ts: Date.now() });
    await store.flush();
    const messages = await repo.chat(fx.claims);
    expect(messages.map((message) => message.text)).toContain("db hello");
  });

  it("verifies a real local Supabase JWT against JWKS and serves its workspace", async () => {
    const { supabaseUrl, anonKey, serviceRoleKey, databaseUrl } = localSupabase();
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const email = `p3b-${randomUUID()}@northwind.local`;
    const password = `pw-${randomUUID()}`;
    const created = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      throw new Error(`seed user failed: ${created.error?.message}`);
    }
    const userId = created.data.user.id;
    users.push(userId);

    const workspaceId = `p3b-jwt-${randomUUID()}`;
    workspaces.push(workspaceId);
    await admin`INSERT INTO workspaces (id, name) VALUES (${workspaceId}, 'jwt')`;
    await admin`INSERT INTO profiles (id, name) VALUES (${userId}, 'Jwt Maya')`;
    await admin`INSERT INTO memberships (workspace_id, user_id, role)
      VALUES (${workspaceId}, ${userId}, 'member')`;

    const client = createClient(supabaseUrl, anonKey);
    const signed = await client.auth.signInWithPassword({ email, password });
    const token = signed.data.session?.access_token;
    if (!token) {
      throw new Error(`sign-in failed: ${signed.error?.message}`);
    }

    // The production wiring: real repo, real JWKS verifier, real membership lookup.
    const deps = buildDeps(
      loadEnv({
        AUTH_MODE: "supabase",
        DATABASE_URL: databaseUrl,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_JWKS_URL: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      }),
    );
    try {
      await expect(deps.auth.verify(token)).resolves.toEqual({
        userId,
        name: "Jwt Maya",
        workspaceId,
      });
      const base = await boot(deps);
      const day = await fetch(`${base}/me/day`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(day.status).toBe(200);
    } finally {
      await (deps.repo as PostgresRepo).close();
    }
  });
});
