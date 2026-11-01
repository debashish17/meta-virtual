import { randomUUID } from "node:crypto";
import type { AuthClaims, ProposedChange } from "@office/shared";
import postgres, { type Sql } from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "../auth/verify.js";
import { localSupabase } from "./local.js";
import { NotFoundError, NotPendingError } from "./repo.js";
import { PostgresRepo, createPostgresRepo, isPoolerUrl } from "./postgres.js";

vi.setConfig({ testTimeout: 30_000 });

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

describe("isPoolerUrl", () => {
  it("detects transaction-mode poolers", () => {
    expect(isPoolerUrl("postgresql://postgres:postgres@127.0.0.1:54322/postgres")).toBe(false);
    expect(isPoolerUrl("postgresql://u:p@aws-0-eu.pooler.supabase.com:6543/postgres")).toBe(true);
    expect(isPoolerUrl("postgresql://u:p@db.example.com:5432/x?pgbouncer=true")).toBe(true);
    expect(isPoolerUrl("postgresql://u:p@db.example.com:5432/x?pool_mode=transaction")).toBe(true);
  });
});

describe.runIf(DATABASE_URL === null)("PostgresRepo (skipped)", () => {
  it("needs local Supabase", () => {
    console.warn("[db] skipping: local Supabase is not reachable (`pnpm db:start`)");
  });
});

describe.runIf(DATABASE_URL !== null)("PostgresRepo", () => {
  let repo: PostgresRepo;
  let admin: Sql;
  const workspaces: string[] = [];

  interface Fixture {
    workspaceId: string;
    userId: string;
    claims: AuthClaims;
    accountId: string;
    projectId: string;
    milestoneId: string;
    taskId: string;
    commitmentId: string;
    meetingId: string;
  }

  async function makeFixture(tag: string): Promise<Fixture> {
    const workspaceId = `p2c-${tag}-${randomUUID()}`;
    const userId = randomUUID();
    const accountId = randomUUID();
    const projectId = randomUUID();
    const milestoneId = randomUUID();
    const taskId = randomUUID();
    const commitmentId = randomUUID();
    const meetingId = randomUUID();
    await admin`INSERT INTO workspaces (id, name) VALUES (${workspaceId}, ${tag})`;
    await admin`INSERT INTO memberships (workspace_id, user_id, role)
      VALUES (${workspaceId}, ${userId}, 'member')`;
    await admin`INSERT INTO accounts (id, workspace_id, name, deal_stage, owner_id)
      VALUES (${accountId}, ${workspaceId}, 'Acme', 'Negotiation', ${userId})`;
    await admin`INSERT INTO projects (id, workspace_id, account_id, name, owner_id)
      VALUES (${projectId}, ${workspaceId}, ${accountId}, 'Widgets', ${userId})`;
    await admin`INSERT INTO milestones (id, workspace_id, project_id, name, target_date, status)
      VALUES (${milestoneId}, ${workspaceId}, ${projectId}, 'Go-live', '2026-11-15', 'upcoming')`;
    await admin`INSERT INTO tasks (id, workspace_id, project_id, title, owner_id, due_date,
        status, blocked_reason)
      VALUES (${taskId}, ${workspaceId}, ${projectId}, 'Fix webhooks', ${userId},
        '2026-11-14', 'blocked', 'Waiting on vendor')`;
    await admin`INSERT INTO commitments (id, workspace_id, account_id, text, due_date,
        linked_milestone_id)
      VALUES (${commitmentId}, ${workspaceId}, ${accountId}, 'Go-live by 15 Nov',
        '2026-11-15', ${milestoneId})`;
    await admin`INSERT INTO meetings (id, workspace_id, zone_id, started_at, transcript,
        summary, decisions)
      VALUES (${meetingId}, ${workspaceId}, 'acme_room', ${Date.now()}, 'hello', 'sync', '[]')`;
    workspaces.push(workspaceId);
    return {
      workspaceId,
      userId,
      claims: { userId, name: tag, workspaceId },
      accountId,
      projectId,
      milestoneId,
      taskId,
      commitmentId,
      meetingId,
    };
  }

  function pendingChange(fx: Fixture, change: Partial<ProposedChange>): ProposedChange {
    return {
      id: randomUUID(),
      type: "milestone_date",
      status: "pending",
      targetId: null,
      before: null,
      after: {},
      needsReview: false,
      sourceMeetingId: fx.meetingId,
      ...change,
    };
  }

  beforeAll(() => {
    repo = createPostgresRepo(DATABASE_URL as string);
    admin = postgres(DATABASE_URL as string, { max: 1 });
  });

  afterEach(async () => {
    if (workspaces.length > 0) {
      await admin`DELETE FROM workspaces WHERE id = ANY(${workspaces})`;
      workspaces.length = 0;
    }
  });

  afterAll(async () => {
    await repo.close();
    await admin.end();
  });

  it("isolates workspaces: reads of B return nothing with A's claims", async () => {
    const a = await makeFixture("isolation-a");
    const b = await makeFixture("isolation-b");
    expect(await repo.tasks(a.claims)).toHaveLength(1);
    expect(await repo.milestone(a.claims, b.milestoneId)).toBeNull();
    expect(await repo.account(a.claims, b.accountId)).toBeNull();
    expect(await repo.project(a.claims, b.projectId)).toBeNull();
    expect(await repo.task(a.claims, b.taskId)).toBeNull();
    expect(await repo.commitment(a.claims, b.commitmentId)).toBeNull();
    expect(await repo.meeting(a.claims, b.meetingId)).toBeNull();
    expect(await repo.changes(a.claims)).toEqual([]);
    expect(await repo.audit(a.claims)).toEqual([]);
    expect(await repo.chat(a.claims)).toEqual([]);
    expect(await repo.member({ userId: b.userId, name: "b", workspaceId: a.workspaceId })).toBeNull();
  });

  it("enforces RLS on unfiltered reads: only the caller's rows are visible", async () => {
    const a = await makeFixture("rls-a");
    const b = await makeFixture("rls-b");
    const rows = await repo.withUser(a.claims, async (tx) => {
      return await tx`SELECT id FROM tasks`;
    });
    expect(rows.map((r) => String(r["id"])).sort()).toEqual([a.taskId]);
    const memberships = await repo.withUser(b.claims, async (tx) => {
      return await tx`SELECT workspace_id FROM memberships`;
    });
    expect(memberships.map((r) => String(r["workspace_id"]))).toEqual([b.workspaceId]);
  });

  it("refuses writes as the authenticated role (no write policies)", async () => {
    const fx = await makeFixture("nowrite");
    await expect(
      repo.withUser(fx.claims, async (tx) => {
        await tx`
          INSERT INTO tasks (workspace_id, project_id, title, status)
          VALUES (${fx.workspaceId}, ${fx.projectId}, 'sneaky', 'todo')
        `;
      }),
    ).rejects.toThrow(/permission denied|row-level security/);
    await expect(
      repo.withUser(fx.claims, async (tx) => {
        await tx`UPDATE tasks SET title = 'sneaky' WHERE id = ${fx.taskId}`;
      }),
    ).rejects.toThrow(/permission denied|row-level security/);
    await expect(
      repo.withUser(fx.claims, async (tx) => {
        await tx`DELETE FROM tasks WHERE id = ${fx.taskId}`;
      }),
    ).rejects.toThrow(/permission denied|row-level security/);
    expect((await repo.task(fx.claims, fx.taskId))?.title).toBe("Fix webhooks");
  });

  it("approves a change: applies it and writes an audit row", async () => {
    const fx = await makeFixture("approve");
    const change = pendingChange(fx, {
      type: "milestone_date",
      targetId: fx.milestoneId,
      before: { targetDate: "2026-11-15" },
      after: { targetDate: "2026-11-22" },
    });
    await repo.saveChanges(fx.claims, [change]);
    await repo.approveChange(fx.claims, change.id);
    expect((await repo.milestone(fx.claims, fx.milestoneId))?.targetDate).toBe("2026-11-22");
    expect((await repo.milestone(fx.claims, fx.milestoneId))?.sourceMeetingId).toBe(fx.meetingId);
    expect((await repo.change(fx.claims, change.id))?.status).toBe("approved");
    const [row] = await repo.audit(fx.claims);
    expect(row.action).toBe("approve");
    expect(row.table).toBe("milestones");
    expect(row.rowId).toBe(fx.milestoneId);
    expect(row.actorId).toBe(fx.userId);
    expect(row.before).toEqual({ targetDate: "2026-11-15" });
    expect(row.after).toEqual({ targetDate: "2026-11-22" });
  });

  it("applies every change type", async () => {
    const fx = await makeFixture("alltypes");
    await repo.saveChanges(fx.claims, [
      pendingChange(fx, {
        type: "commitment_update",
        targetId: fx.commitmentId,
        before: { text: "Go-live by 15 Nov" },
        after: { text: "Go-live by 22 Nov", dueDate: "2026-11-22" },
      }),
      pendingChange(fx, {
        type: "commitment_create",
        targetId: null,
        after: { accountId: fx.accountId, text: "Weekly status call", dueDate: null },
      }),
      pendingChange(fx, {
        type: "task_reassign",
        targetId: fx.taskId,
        before: { ownerId: fx.userId },
        after: { ownerId: "someone-else" },
      }),
      pendingChange(fx, {
        type: "task_update",
        targetId: fx.taskId,
        before: { status: "blocked" },
        after: { status: "in_progress", blockedReason: null },
      }),
      pendingChange(fx, {
        type: "task_create",
        targetId: null,
        after: {
          title: "Notify customer",
          ownerId: fx.userId,
          projectId: fx.projectId,
          status: "todo",
        },
      }),
    ]);
    for (const change of await repo.changes(fx.claims, { status: "pending" })) {
      await repo.approveChange(fx.claims, change.id);
    }
    const commitment = await repo.commitment(fx.claims, fx.commitmentId);
    expect(commitment?.text).toBe("Go-live by 22 Nov");
    expect(commitment?.dueDate).toBe("2026-11-22");
    expect(await repo.commitments(fx.claims, fx.accountId)).toHaveLength(2);
    const task = await repo.task(fx.claims, fx.taskId);
    expect(task?.ownerId).toBe("someone-else");
    expect(task?.status).toBe("in_progress");
    expect(task?.blockedReason).toBeNull();
    const created = (await repo.tasks(fx.claims)).find((t) => t.title === "Notify customer");
    expect(created?.ownerId).toBe(fx.userId);
    expect(await repo.audit(fx.claims)).toHaveLength(5);
  });

  it("rejects a second decision on the same change", async () => {
    const fx = await makeFixture("twice");
    const change = pendingChange(fx, {
      type: "milestone_date",
      targetId: fx.milestoneId,
      before: { targetDate: "2026-11-15" },
      after: { targetDate: "2026-11-22" },
    });
    await repo.saveChanges(fx.claims, [change]);
    await repo.approveChange(fx.claims, change.id);
    await expect(repo.approveChange(fx.claims, change.id)).rejects.toBeInstanceOf(NotPendingError);
    await expect(repo.rejectChange(fx.claims, change.id)).rejects.toBeInstanceOf(NotPendingError);
    await expect(repo.approveChange(fx.claims, randomUUID())).rejects.toBeInstanceOf(NotFoundError);
    await expect(repo.rejectChange(fx.claims, randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects approving a change with no matching target", async () => {
    const fx = await makeFixture("notarget");
    const dangling = pendingChange(fx, {
      type: "task_reassign",
      targetId: null,
      after: { ownerId: fx.userId },
    });
    const missing = pendingChange(fx, {
      type: "milestone_date",
      targetId: randomUUID(),
      after: { targetDate: "2026-11-22" },
    });
    await repo.saveChanges(fx.claims, [dangling, missing]);
    await expect(repo.approveChange(fx.claims, dangling.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(repo.approveChange(fx.claims, missing.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await repo.change(fx.claims, dangling.id))?.status).toBe("pending");
  });

  it("leaves records unchanged when a change is rejected", async () => {
    const fx = await makeFixture("reject");
    const change = pendingChange(fx, {
      type: "task_create",
      targetId: null,
      after: { title: "Notify customer", ownerId: fx.userId, projectId: fx.projectId },
    });
    await repo.saveChanges(fx.claims, [change]);
    await repo.rejectChange(fx.claims, change.id);
    expect((await repo.tasks(fx.claims)).some((t) => t.title === "Notify customer")).toBe(false);
    expect((await repo.change(fx.claims, change.id))?.status).toBe("rejected");
    const [row] = await repo.audit(fx.claims);
    expect(row.action).toBe("reject");
  });

  it("checks membership before every write", async () => {
    const fx = await makeFixture("member");
    const foreign: AuthClaims = { userId: fx.userId, name: "x", workspaceId: "other-workspace" };
    const change = pendingChange(fx, { targetId: fx.milestoneId, after: { targetDate: "2026-11-22" } });
    await expect(repo.saveChanges(foreign, [change])).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(
      repo.createMeeting(foreign, { zoneId: "z", transcript: "t", summary: "s", decisions: [] }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(repo.saveChat(foreign, { name: "x", text: "hi" })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(repo.approveChange(foreign, randomUUID())).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(repo.rejectChange(foreign, randomUUID())).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("scopes meetings, changes and chat to the workspace", async () => {
    const a = await makeFixture("scope-a");
    const b = await makeFixture("scope-b");
    const meeting = await repo.createMeeting(a.claims, {
      zoneId: "acme_room",
      transcript: "t",
      summary: "s",
      decisions: [{ text: "d" }],
    });
    expect(meeting.decisions).toEqual([{ text: "d" }]);
    expect(await repo.meetings(a.claims)).toHaveLength(2);
    expect(await repo.meetings(b.claims)).toHaveLength(1);
    const change = pendingChange(a, {
      targetId: a.milestoneId,
      after: { targetDate: "2026-11-22" },
      sourceMeetingId: meeting.id,
    });
    await repo.saveChanges(a.claims, [change]);
    expect(await repo.changes(a.claims, { status: "pending" })).toHaveLength(1);
    expect(await repo.changes(a.claims, { meetingId: meeting.id })).toHaveLength(1);
    expect(await repo.changes(a.claims, { meetingId: a.meetingId })).toHaveLength(0);
    expect(await repo.changes(b.claims)).toEqual([]);
    await repo.saveChat(a.claims, { name: "a", text: "hello" });
    expect(await repo.chat(a.claims)).toHaveLength(1);
    expect(await repo.chat(b.claims)).toEqual([]);
  });
});
