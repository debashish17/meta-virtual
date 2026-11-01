import { describe, expect, it } from "vitest";
import {
  DEMO_ACCOUNT,
  DEMO_COMMITMENT,
  DEMO_MILESTONE,
  DEMO_PROJECT,
  MyDay,
  ProjectStatus,
  AccountStatus,
  WORKSPACE_ID,
  acmeSyncExpected,
  type AuthClaims,
} from "@office/shared";
import { randomUUID } from "node:crypto";
import { InMemoryRepo } from "../db/repo.js";
import { NotFoundError } from "../db/repo.js";
import { myDay, projectStatus, accountStatus } from "./index.js";

const MAYA: AuthClaims = { userId: "maya", name: "Maya", workspaceId: WORKSPACE_ID };
const ARJUN: AuthClaims = { userId: "arjun", name: "Arjun", workspaceId: WORKSPACE_ID };

async function approvedRepo(): Promise<InMemoryRepo> {
  const repo = new InMemoryRepo();
  const changes = acmeSyncExpected(randomUUID());
  await repo.saveChanges(MAYA, changes);
  for (const change of changes) {
    await repo.approveChange(MAYA, change.id);
  }
  return repo;
}

describe("myDay", () => {
  it("lists Maya's open tasks, each with a reason, plus the commitment follow-up", async () => {
    const repo = new InMemoryRepo();
    const day = await myDay(repo, MAYA, "maya");
    expect(MyDay.safeParse(day).success).toBe(true);
    expect(day.items.length).toBeGreaterThan(0);
    for (const item of day.items) {
      expect(item.reason.trim().length).toBeGreaterThan(0);
    }
    const titles = day.items.map((item) => item.title);
    expect(titles).toContain("Prepare Acme onboarding guide");
    expect(titles).not.toContain("Write integration test suite");
    expect(titles).toContain(DEMO_COMMITMENT.text);
  });

  it("lists Arjun's tasks for Arjun", async () => {
    const repo = new InMemoryRepo();
    const day = await myDay(repo, ARJUN, "arjun");
    const titles = day.items.map((item) => item.title);
    expect(titles).toContain("Write integration test suite");
    expect(titles).not.toContain("Prepare Acme onboarding guide");
  });

  it("reflects the new date after the demo changes are applied", async () => {
    const repo = await approvedRepo();
    const day = await myDay(repo, MAYA, "maya");
    expect(JSON.stringify(day)).toContain("2026-11-22");
  });
});

describe("projectStatus", () => {
  it("returns the project with milestones, tasks, decisions and people", async () => {
    const repo = new InMemoryRepo();
    const status = await projectStatus(repo, MAYA, DEMO_PROJECT.id);
    expect(ProjectStatus.safeParse(status).success).toBe(true);
    expect(status.project.id).toBe(DEMO_PROJECT.id);
    expect(status.milestones.map((m) => m.id)).toContain(DEMO_MILESTONE.id);
    expect(status.tasks.length).toBe(3);
    expect(status.people.map((p) => p.name).sort()).toEqual(["Arjun", "Maya"]);
  });

  it("throws NotFoundError for an unknown project", async () => {
    const repo = new InMemoryRepo();
    await expect(projectStatus(repo, MAYA, randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("reflects approvals: the milestone moves and the webhook fix moves to Arjun", async () => {
    const repo = await approvedRepo();
    const status = await projectStatus(repo, MAYA, DEMO_PROJECT.id);
    expect(status.milestones.find((m) => m.id === DEMO_MILESTONE.id)?.targetDate).toBe(
      "2026-11-22",
    );
    expect(status.tasks.find((t) => t.title === "Fix webhook signature validation")?.ownerId).toBe(
      "arjun",
    );
  });
});

describe("accountStatus", () => {
  it("returns the account with contacts, commitments, open tasks and people", async () => {
    const repo = new InMemoryRepo();
    const status = await accountStatus(repo, MAYA, DEMO_ACCOUNT.id);
    expect(AccountStatus.safeParse(status).success).toBe(true);
    expect(status.account.id).toBe(DEMO_ACCOUNT.id);
    expect(status.contacts.length).toBe(1);
    expect(status.commitments.map((c) => c.id)).toContain(DEMO_COMMITMENT.id);
    expect(status.openTasks.length).toBe(3);
    expect(status.people.map((p) => p.name).sort()).toEqual(["Arjun", "Maya"]);
  });

  it("throws NotFoundError for an unknown account", async () => {
    const repo = new InMemoryRepo();
    await expect(accountStatus(repo, MAYA, randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("reflects approvals: the commitment text moves to 22 Nov", async () => {
    const repo = await approvedRepo();
    const status = await accountStatus(repo, MAYA, DEMO_ACCOUNT.id);
    expect(status.commitments.find((c) => c.id === DEMO_COMMITMENT.id)?.text).toBe(
      "Go-live by 22 Nov",
    );
  });
});
