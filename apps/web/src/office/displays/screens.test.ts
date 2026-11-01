import { describe, expect, it } from "vitest";
import {
  DEMO_ACCOUNT,
  DEMO_COMMITMENT,
  DEMO_CONTACT,
  DEMO_MILESTONE,
  DEMO_PEOPLE,
  DEMO_PROJECT,
  DEMO_TASKS,
  type AccountStatus,
  type ProjectStatus,
} from "@office/shared";
import {
  buildAcmeScreen,
  buildProjectScreen,
  screenHash,
  shortDate,
} from "./screens";

function accountStatus(overrides: Partial<AccountStatus> = {}): AccountStatus {
  return {
    account: DEMO_ACCOUNT,
    contacts: [DEMO_CONTACT],
    commitments: [DEMO_COMMITMENT],
    openTasks: [...DEMO_TASKS],
    recentMeetings: [],
    people: DEMO_PEOPLE.map((p) => ({ id: p.key, name: p.name })),
    ...overrides,
  };
}

function projectStatus(overrides: Partial<ProjectStatus> = {}): ProjectStatus {
  return {
    project: DEMO_PROJECT,
    milestones: [DEMO_MILESTONE],
    tasks: [...DEMO_TASKS],
    decisions: [],
    people: DEMO_PEOPLE.map((p) => ({ id: p.key, name: p.name })),
    ...overrides,
  };
}

describe("shortDate", () => {
  it("renders an ISO date as day + month", () => {
    expect(shortDate("2026-11-15")).toBe("15 Nov");
    expect(shortDate("2026-01-02")).toBe("2 Jan");
  });

  it("passes through null and non-ISO text untouched", () => {
    expect(shortDate(null)).toBe("no date");
    expect(shortDate("soon")).toBe("soon");
  });
});

describe("buildAcmeScreen", () => {
  it("shows the deal stage, the commitment and the next milestone", () => {
    const screen = buildAcmeScreen(accountStatus(), projectStatus());
    expect(screen.id).toBe("acme");
    expect(screen.title).toBe("Acme Corp");
    expect(screen.sections.map((s) => s.heading)).toEqual([
      "Deal stage",
      "Commitment",
      "Next milestone",
    ]);
    expect(screen.sections[0].lines).toEqual(["Implementation"]);
    expect(screen.sections[1].lines).toEqual(["Go-live by 15 Nov — due 15 Nov"]);
    expect(screen.sections[2].lines).toEqual(["Go-live · 15 Nov"]);
  });

  it("picks the earliest upcoming milestone, skipping done ones", () => {
    const done = { ...DEMO_MILESTONE, id: "ac0e0004-0004-4004-8004-000000000099", status: "done" as const };
    const later = {
      ...DEMO_MILESTONE,
      id: "ac0e0004-0004-4004-8004-000000000098",
      name: "Hypercare",
      targetDate: "2026-12-01",
    };
    const screen = buildAcmeScreen(accountStatus(), projectStatus({ milestones: [later, done, DEMO_MILESTONE] }));
    expect(screen.sections[2].lines).toEqual(["Go-live · 15 Nov"]);
  });

  it("names empty states instead of blank sections", () => {
    const screen = buildAcmeScreen(accountStatus({ commitments: [] }), projectStatus({ milestones: [] }));
    expect(screen.sections[1].lines).toEqual(["No open commitments"]);
    expect(screen.sections[2].lines).toEqual(["No upcoming milestones"]);
  });

  it("rejects data that is not an account or project status", () => {
    expect(() => buildAcmeScreen({ nope: true }, projectStatus())).toThrow();
    expect(() => buildAcmeScreen(accountStatus(), { nope: true })).toThrow();
  });
});

describe("buildProjectScreen", () => {
  it("shows milestones, blocked tasks and owners", () => {
    const screen = buildProjectScreen(projectStatus());
    expect(screen.id).toBe("project");
    expect(screen.title).toBe("Acme Payments Integration");
    expect(screen.sections.map((s) => s.heading)).toEqual(["Milestones", "Blocked", "Owners"]);
    expect(screen.sections[0].lines).toEqual(["Go-live · 15 Nov (upcoming)"]);
    expect(screen.sections[1].lines).toEqual([
      "Fix webhook signature validation — Waiting on the vendor fix (Maya)",
    ]);
    expect(screen.sections[2].lines).toEqual(["Arjun · 1 open task", "Maya · 2 open tasks"]);
  });

  it("says so when nothing is blocked and counts only open tasks per owner", () => {
    const tasks = DEMO_TASKS.map((t) => ({ ...t, status: "done" as const, blockedReason: null }));
    const screen = buildProjectScreen(projectStatus({ tasks }));
    expect(screen.sections[1].lines).toEqual(["Nothing blocked"]);
    expect(screen.sections[2].lines).toEqual(["No open tasks"]);
  });

  it("labels unknown and missing owners honestly", () => {
    const tasks = [
      { ...DEMO_TASKS[0], ownerId: "zoe" },
      { ...DEMO_TASKS[1], ownerId: null },
      { ...DEMO_TASKS[2], status: "done" as const },
    ];
    const screen = buildProjectScreen(projectStatus({ tasks }));
    expect(screen.sections[2].lines).toEqual(["Unassigned · 1 open task", "zoe · 1 open task"]);
  });

  it("rejects data that is not a project status", () => {
    expect(() => buildProjectScreen({ nope: true })).toThrow();
  });
});

describe("tone", () => {
  it("warns while anything is blocked, ok otherwise", () => {
    expect(buildProjectScreen(projectStatus()).tone).toBe("warn");
    const tasks = DEMO_TASKS.map((t) => ({ ...t, status: "todo" as const, blockedReason: null }));
    expect(buildProjectScreen(projectStatus({ tasks })).tone).toBe("ok");
    expect(buildAcmeScreen(accountStatus(), projectStatus()).tone).toBe("ok");
  });
});

describe("screenHash", () => {
  it("is stable for equal data and changes when any line changes", () => {
    const a = buildProjectScreen(projectStatus());
    const b = buildProjectScreen(projectStatus());
    expect(screenHash(a)).toBe(screenHash(b));
    const changed = buildProjectScreen(
      projectStatus({ milestones: [{ ...DEMO_MILESTONE, targetDate: "2026-11-22" }] }),
    );
    expect(screenHash(changed)).not.toBe(screenHash(a));
  });
});
