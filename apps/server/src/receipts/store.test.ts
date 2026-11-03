import {
  DEMO_ACCOUNT,
  DEMO_COMMITMENT,
  DEMO_MILESTONE,
  DEMO_PROJECT,
  DEMO_TASKS,
  WORKSPACE_ID,
  acmeSyncExpected,
  type AuthClaims,
} from "@office/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryRepo, type Repo } from "../db/repo.js";
import { createReceiptStore } from "./store.js";

const MAYA: AuthClaims = { userId: "dev-maya", name: "Maya", workspaceId: WORKSPACE_ID };
const ARJUN: AuthClaims = { userId: "dev-arjun", name: "Arjun", workspaceId: WORKSPACE_ID };
const STRANGER: AuthClaims = { userId: "user-x", name: "X", workspaceId: "other-workspace" };

const SUMMARY = "Acme sync: go-live moves to 22 Nov, the webhook fix moves to Arjun.";

/** One fixture meeting with the four expected changes, all pending. */
async function seedMeeting(repo: Repo): Promise<string> {
  const meeting = await repo.createMeeting(MAYA, {
    zoneId: "acme_room",
    transcript: "Maya: move go-live to 22 November.",
    summary: SUMMARY,
    decisions: [{ text: "Move go-live to 22 November" }],
  });
  await repo.saveChanges(MAYA, acmeSyncExpected(meeting.id));
  return meeting.id;
}

async function decide(
  repo: Repo,
  claims: AuthClaims,
  type: string,
  decision: "approve" | "reject",
): Promise<string> {
  const pending = await repo.changes(claims, { status: "pending" });
  const change = pending.find((c) => c.type === type);
  if (!change) {
    throw new Error(`no pending ${type} change`);
  }
  if (decision === "approve") {
    await repo.approveChange(claims, change.id);
  } else {
    await repo.rejectChange(claims, change.id);
  }
  return change.id;
}

describe("ReceiptStore", () => {
  let repo: Repo;

  beforeEach(async () => {
    repo = createInMemoryRepo();
    await seedMeeting(repo);
  });

  it("reads empty before anything is decided", async () => {
    const store = createReceiptStore(repo);
    await expect(store.list(MAYA, {})).resolves.toEqual([]);
  });

  it("composes one receipt per approved change, with the approver's name", async () => {
    const changeId = await decide(repo, MAYA, "milestone_date", "approve");
    const store = createReceiptStore(repo);
    const receipts = await store.list(MAYA, {});
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      changeId,
      kind: "milestone_date",
      recordType: "milestone",
      recordId: DEMO_MILESTONE.id,
      recordLabel: "Go-live",
      before: { targetDate: "2026-11-15" },
      after: { targetDate: "2026-11-22" },
      meetingLabel: "Acme sync",
      decision: "approved",
      deciderId: "dev-maya",
      deciderName: "Maya",
    });
    expect(typeof receipts[0]!.meetingId).toBe("string");
    expect(typeof receipts[0]!.decidedAt).toBe("number");
  });

  it("resolves an approved create to its new record", async () => {
    await decide(repo, MAYA, "task_create", "approve");
    const store = createReceiptStore(repo);
    const receipts = await store.list(MAYA, {});
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      kind: "task_create",
      recordType: "task",
      recordLabel: "Notify Acme of new date",
      before: null,
      decision: "approved",
      deciderName: "Maya",
    });
    // The new record exists under the receipt's id.
    const task = await repo.task(MAYA, receipts[0]!.recordId);
    expect(task?.title).toBe("Notify Acme of new date");
  });

  it("returns rejected changes as rejected receipts and leaves the record unchanged", async () => {
    const changeId = await decide(repo, ARJUN, "task_reassign", "reject");
    const store = createReceiptStore(repo);
    const receipts = await store.list(ARJUN, {});
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      changeId,
      kind: "task_reassign",
      recordType: "task",
      recordId: DEMO_TASKS[0]!.id,
      recordLabel: "Fix webhook signature validation",
      decision: "rejected",
      deciderId: "dev-arjun",
      deciderName: "Arjun",
    });
    expect((await repo.task(ARJUN, DEMO_TASKS[0]!.id))?.ownerId).toBe("maya");
  });

  it("keeps a rejected create with the change id as its record id", async () => {
    const changeId = await decide(repo, MAYA, "task_create", "reject");
    const store = createReceiptStore(repo);
    const receipts = await store.list(MAYA, {});
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      changeId,
      kind: "task_create",
      recordType: "task",
      recordId: changeId,
      recordLabel: "Notify Acme of new date",
      decision: "rejected",
    });
  });

  it("lists newest first and honours the limit", async () => {
    await decide(repo, MAYA, "milestone_date", "approve");
    await decide(repo, MAYA, "commitment_update", "approve");
    await decide(repo, MAYA, "task_reassign", "approve");
    const store = createReceiptStore(repo);
    const all = await store.list(MAYA, {});
    expect(all).toHaveLength(3);
    for (let i = 1; i < all.length; i++) {
      expect(all[i]!.decidedAt).toBeLessThanOrEqual(all[i - 1]!.decidedAt);
    }
    await expect(store.list(MAYA, { limit: 2 })).resolves.toHaveLength(2);
  });

  it("filters by account and by project", async () => {
    await decide(repo, MAYA, "milestone_date", "approve");
    await decide(repo, MAYA, "commitment_update", "approve");
    await decide(repo, MAYA, "task_reassign", "approve");
    const store = createReceiptStore(repo);
    const kinds = (accountId?: string, projectId?: string) =>
      store.list(MAYA, { accountId, projectId }).then((rs) => rs.map((r) => r.kind).sort());

    // The milestone and the reassigned task belong to the project (hence the account);
    // the commitment belongs to the account (and the project through its linked milestone).
    await expect(kinds(DEMO_ACCOUNT.id)).resolves.toEqual([
      "commitment_update",
      "milestone_date",
      "task_reassign",
    ]);
    await expect(kinds(undefined, DEMO_PROJECT.id)).resolves.toContain("milestone_date");
    await expect(kinds(undefined, DEMO_PROJECT.id)).resolves.toContain("task_reassign");
    await expect(kinds("00000000-0000-4000-8000-000000000000")).resolves.toEqual([]);
    expect((await repo.commitment(MAYA, DEMO_COMMITMENT.id))?.text).toBe("Go-live by 22 Nov");
  });

  it("shows another workspace nothing", async () => {
    await decide(repo, MAYA, "milestone_date", "approve");
    const store = createReceiptStore(repo);
    await expect(store.list(STRANGER, {})).resolves.toEqual([]);
  });
});
