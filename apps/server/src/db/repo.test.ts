import { describe, expect, it } from "vitest";
import {
  DEMO_COMMITMENT,
  DEMO_MILESTONE,
  DEMO_PROJECT,
  DEMO_TASKS,
  WORKSPACE_ID,
  acmeSyncExpected,
  type AuthClaims,
} from "@office/shared";
import { UnauthorizedError } from "../auth/verify.js";
import { NotFoundError, NotPendingError, createInMemoryRepo } from "./repo.js";

const CLAIMS: AuthClaims = { userId: "dev-maya", name: "Maya", workspaceId: WORKSPACE_ID };
const FOREIGN: AuthClaims = { userId: "u2", name: "Intruder", workspaceId: "other-workspace" };
const MEETING_ID = "ac0e0099-0099-4099-8099-000000000099";

describe("InMemoryRepo", () => {
  it("seeds the shared demo data", async () => {
    const repo = createInMemoryRepo();
    expect((await repo.milestone(CLAIMS, DEMO_MILESTONE.id))?.targetDate).toBe("2026-11-15");
    expect(await repo.tasks(CLAIMS, { projectId: DEMO_PROJECT.id })).toHaveLength(3);
    expect((await repo.commitment(CLAIMS, DEMO_COMMITMENT.id))?.text).toBe("Go-live by 15 Nov");
    expect(await repo.member(CLAIMS)).toEqual({
      userId: "dev-maya",
      workspaceId: WORKSPACE_ID,
      role: "member",
    });
  });

  it("approves a change: applies it and writes an audit row", async () => {
    const repo = createInMemoryRepo();
    await repo.saveChanges(CLAIMS, acmeSyncExpected(MEETING_ID));
    const [milestoneChange] = await repo.changes(CLAIMS, { status: "pending" });
    await repo.approveChange(CLAIMS, milestoneChange.id);
    expect((await repo.milestone(CLAIMS, DEMO_MILESTONE.id))?.targetDate).toBe("2026-11-22");
    expect((await repo.change(CLAIMS, milestoneChange.id))?.status).toBe("approved");
    const [row] = await repo.audit(CLAIMS);
    expect(row.action).toBe("approve");
    expect(row.table).toBe("milestones");
    expect(row.rowId).toBe(DEMO_MILESTONE.id);
    expect(row.actorId).toBe("dev-maya");
  });

  it("applies the reassign and create types", async () => {
    const repo = createInMemoryRepo();
    await repo.saveChanges(CLAIMS, acmeSyncExpected(MEETING_ID));
    const pending = await repo.changes(CLAIMS, { status: "pending" });
    const reassign = pending.find((c) => c.type === "task_reassign")!;
    const create = pending.find((c) => c.type === "task_create")!;
    await repo.approveChange(CLAIMS, reassign.id);
    await repo.approveChange(CLAIMS, create.id);
    expect((await repo.task(CLAIMS, DEMO_TASKS[0].id))?.ownerId).toBe("arjun");
    const created = (await repo.tasks(CLAIMS)).find((t) => t.title === "Notify Acme of new date");
    expect(created?.ownerId).toBe("maya");
  });

  it("rejects a second decision on the same change", async () => {
    const repo = createInMemoryRepo();
    await repo.saveChanges(CLAIMS, acmeSyncExpected(MEETING_ID));
    const [first] = await repo.changes(CLAIMS, { status: "pending" });
    await repo.approveChange(CLAIMS, first.id);
    await expect(repo.approveChange(CLAIMS, first.id)).rejects.toBeInstanceOf(NotPendingError);
    await expect(repo.rejectChange(CLAIMS, first.id)).rejects.toBeInstanceOf(NotPendingError);
    await expect(repo.approveChange(CLAIMS, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("leaves records unchanged when a change is rejected", async () => {
    const repo = createInMemoryRepo();
    await repo.saveChanges(CLAIMS, acmeSyncExpected(MEETING_ID));
    const create = (await repo.changes(CLAIMS, { status: "pending" })).find(
      (c) => c.type === "task_create",
    )!;
    await repo.rejectChange(CLAIMS, create.id);
    expect((await repo.tasks(CLAIMS)).some((t) => t.title === "Notify Acme of new date")).toBe(
      false,
    );
    expect((await repo.change(CLAIMS, create.id))?.status).toBe("rejected");
    const [row] = await repo.audit(CLAIMS);
    expect(row.action).toBe("reject");
  });

  it("scopes reads and writes to the claims' workspace", async () => {
    const repo = createInMemoryRepo();
    expect(await repo.member(FOREIGN)).toBeNull();
    expect(await repo.tasks(FOREIGN)).toEqual([]);
    expect(await repo.milestone(FOREIGN, DEMO_MILESTONE.id)).toBeNull();
    await expect(
      repo.saveChanges(FOREIGN, acmeSyncExpected(MEETING_ID)),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
