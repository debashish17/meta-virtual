import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  Account,
  AccountStatus,
  AskRequest,
  AskResult,
  AskSource,
  AskSourceType,
  ChangeStatus,
  ChangeType,
  Commitment,
  Contact,
  DayItem,
  DayItemKind,
  Decision,
  ExtractionResult,
  Meeting,
  MeetingCreate,
  MeetingCreateFixture,
  MeetingCreateTranscript,
  MeetingFixture,
  MeetingProcessResult,
  MeetingSummary,
  Milestone,
  MilestoneStatus,
  MyDay,
  OkResult,
  PersonRef,
  Project,
  ProjectStatus,
  ProposedChange,
  ProposedChangeList,
  ProposedChangeQuery,
  RecordId,
  RecordKind,
  StatusDecision,
  Task,
  TaskStatus,
  ASK_QUESTION_MAX,
} from "./index.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = { id: id(1), name: "Acme Corp", dealStage: "Implementation", ownerId: "maya" };
const contact = { id: id(2), accountId: id(1), name: "Alex Morgan", role: "Operations manager" };
const project = { id: id(3), accountId: id(1), name: "Acme Payments Integration", ownerId: "arjun" };
const milestone = {
  id: id(4), projectId: id(3), name: "Go-live", targetDate: "2026-11-15",
  status: "upcoming", sourceMeetingId: null,
} as const;
const task = {
  id: id(11), projectId: id(3), accountId: null, title: "Fix webhook signature validation",
  ownerId: "maya", dueDate: "2026-11-14", status: "blocked",
  blockedReason: "Waiting on the vendor fix", sourceMeetingId: null,
} as const;
const commitment = {
  id: id(21), accountId: id(1), text: "Go-live by 15 Nov", dueDate: "2026-11-15",
  linkedTaskId: null, linkedMilestoneId: id(4), sourceMeetingId: null,
} as const;
const meeting = {
  id: id(31), zoneId: "acme_room", startedAt: 1730419200000,
  transcript: "Maya: let's move go-live.", summary: "Go-live moves.",
  decisions: [{ text: "Move go-live to 22 Nov" }],
} as const;
const change = {
  id: id(41), type: "milestone_date", status: "pending", targetId: id(4),
  before: { targetDate: "2026-11-15" }, after: { targetDate: "2026-11-22" },
  needsReview: false, sourceMeetingId: id(31),
} as const;
const extraction = {
  summary: "Go-live moves to 22 Nov.",
  decisions: [{ text: "Move go-live" }],
  tasks: [{ title: "Notify Acme of new date", ownerName: "Maya", action: "create" }],
  commitments: [{ text: "Go-live by 22 Nov", accountName: "Acme Corp", dueDate: "2026-11-22" }],
  milestoneChanges: [
    { projectName: "Acme Payments Integration", milestoneName: "Go-live", newTargetDate: "2026-11-22" },
  ],
} as const;

describe("http contract", () => {
  it("accepts record ids and the record shapes", () => {
    expect(RecordId.parse(id(1))).toBe(id(1));
    expect(Account.parse(account)).toBeTruthy();
    expect(Contact.parse(contact)).toBeTruthy();
    expect(Project.parse(project)).toBeTruthy();
    expect(MilestoneStatus.parse("done")).toBe("done");
    expect(Milestone.parse(milestone)).toBeTruthy();
    expect(TaskStatus.parse("in_progress")).toBe("in_progress");
    expect(Task.parse(task)).toBeTruthy();
    expect(Task.parse({ ...task, projectId: null, accountId: id(1) }).accountId).toBe(id(1));
    expect(Commitment.parse(commitment)).toBeTruthy();
    expect(Decision.parse({ text: "Move go-live" })).toBeTruthy();
    expect(Meeting.parse(meeting)).toBeTruthy();
    expect(MeetingSummary.parse({
      id: meeting.id, zoneId: meeting.zoneId, startedAt: meeting.startedAt, summary: meeting.summary,
    })).toBeTruthy();
    expect(Account.parse({ ...account, name: "  Acme  " }).name).toBe("Acme");
  });

  it("rejects bad records", () => {
    expect(RecordId.safeParse("not-a-uuid").success).toBe(false);
    expect(RecordId.safeParse("").success).toBe(false);
    expect(Account.safeParse({ ...account, id: "x" }).success).toBe(false);
    expect(Account.safeParse({ ...account, name: "   " }).success).toBe(false);
    expect(Account.safeParse({ ...account, ownerId: "" }).success).toBe(false);
    expect(Contact.safeParse({ ...contact, role: "" }).success).toBe(false);
    expect(Project.safeParse({ ...project, accountId: id(1).slice(0, 8) }).success).toBe(false);
    expect(Milestone.safeParse({ ...milestone, status: "late" }).success).toBe(false);
    expect(Task.safeParse({ ...task, status: "waiting" }).success).toBe(false);
    expect(Task.safeParse({ ...task, projectId: null, accountId: null }).success).toBe(false);
    expect(Task.safeParse({ ...task, projectId: id(3), accountId: id(1) }).success).toBe(false);
    expect(Task.safeParse({ ...task, title: "" }).success).toBe(false);
    expect(Commitment.safeParse({ ...commitment, text: "  " }).success).toBe(false);
    expect(Decision.safeParse({ text: "" }).success).toBe(false);
    expect(Decision.safeParse({ text: "   " }).success).toBe(false);
    expect(Decision.safeParse({}).success).toBe(false);
    expect(Meeting.safeParse({ ...meeting, startedAt: -1 }).success).toBe(false);
    expect(Meeting.safeParse({ ...meeting, startedAt: 1.5 }).success).toBe(false);
    expect(Meeting.safeParse({ ...meeting, transcript: "" }).success).toBe(false);
    expect(Meeting.safeParse({ ...meeting, zoneId: "" }).success).toBe(false);
    expect(MeetingSummary.safeParse({ ...meeting }).success).toBe(false);
  });

  it("accepts every proposed-change type and status", () => {
    for (const type of ["milestone_date", "commitment_update", "commitment_create",
      "task_create", "task_update", "task_reassign"] as const) {
      expect(ChangeType.parse(type)).toBe(type);
    }
    for (const status of ["pending", "approved", "rejected"] as const) {
      expect(ChangeStatus.parse(status)).toBe(status);
    }
    expect(ProposedChange.parse(change)).toBeTruthy();
    expect(ProposedChange.parse({
      ...change, type: "task_create", targetId: null, before: null,
      after: { title: "Notify Acme of new date" },
    }).targetId).toBeNull();
  });

  it("rejects bad proposed changes", () => {
    expect(ProposedChange.safeParse({ ...change, type: "project_create" }).success).toBe(false);
    expect(ProposedChange.safeParse({ ...change, status: "draft" }).success).toBe(false);
    expect(ProposedChange.safeParse({ ...change, targetId: "nope" }).success).toBe(false);
    expect(ProposedChange.safeParse({ ...change, after: null }).success).toBe(false);
    expect(ProposedChange.safeParse({ ...change, after: ["x"] }).success).toBe(false);
    expect(ProposedChange.safeParse({ ...change, sourceMeetingId: "" }).success).toBe(false);
    const missing = { ...change, needsReview: undefined };
    expect(ProposedChange.safeParse(missing).success).toBe(false);
  });

  it("accepts extraction results, minimal and full", () => {
    expect(ExtractionResult.parse(extraction)).toBeTruthy();
    expect(ExtractionResult.parse({
      summary: "Nothing actionable.", decisions: [], tasks: [], commitments: [], milestoneChanges: [],
    })).toBeTruthy();
    expect(ExtractionResult.parse({
      ...extraction,
      tasks: [{
        title: "Fix webhooks", ownerName: "Arjun", dueDate: "2026-11-20",
        action: "update", matchHint: "webhook",
      }],
    }).tasks).toHaveLength(1);
  });

  it("rejects bad extraction results", () => {
    expect(ExtractionResult.safeParse({ ...extraction, summary: "" }).success).toBe(false);
    expect(ExtractionResult.safeParse({ ...extraction, tasks: [{ title: "x" }] }).success).toBe(false);
    expect(ExtractionResult.safeParse({
      ...extraction, tasks: [{ title: "x", action: "delete" }],
    }).success).toBe(false);
    expect(ExtractionResult.safeParse({
      ...extraction, tasks: [{ title: "", action: "create" }],
    }).success).toBe(false);
    expect(ExtractionResult.safeParse({
      ...extraction, tasks: [{ title: "x", action: "create", owner: "Arjun" }],
    }).success).toBe(false);
    expect(ExtractionResult.safeParse({
      ...extraction, commitments: [{ text: "x" }],
    }).success).toBe(false);
    expect(ExtractionResult.safeParse({
      ...extraction, milestoneChanges: [{ milestoneName: "G", newTargetDate: "2026-11-22" }],
    }).success).toBe(false);
  });

  it("accepts day items and the status shapes", () => {
    expect(DayItemKind.parse("followup")).toBe("followup");
    const item = {
      id: id(11), kind: "task", title: "Fix webhook signature validation",
      reason: "Blocked, due 2026-11-14", dueDate: "2026-11-14",
    } as const;
    expect(DayItem.parse(item)).toBeTruthy();
    expect(MyDay.parse({ items: [item, { ...item, id: id(12), kind: "meeting", dueDate: null }] })).toBeTruthy();
    expect(MyDay.parse({ items: [] }).items).toEqual([]);
    expect(PersonRef.parse({ id: "maya", name: "Maya" })).toBeTruthy();
    expect(StatusDecision.parse({ text: "Move go-live", meetingId: id(31) })).toBeTruthy();
    expect(ProjectStatus.parse({
      project, milestones: [milestone], tasks: [task],
      decisions: [{ text: "Move go-live", meetingId: id(31) }],
      people: [{ id: "maya", name: "Maya" }, { id: "arjun", name: "Arjun" }],
    })).toBeTruthy();
    expect(AccountStatus.parse({
      account, contacts: [contact], commitments: [commitment], openTasks: [task],
      recentMeetings: [{ id: id(31), zoneId: "acme_room", startedAt: 1, summary: "Go-live moves." }],
      people: [{ id: "maya", name: "Maya" }],
    })).toBeTruthy();
  });

  it("rejects bad day items and statuses", () => {
    const item = {
      id: id(11), kind: "task", title: "Fix it", reason: "Blocked", dueDate: null,
    } as const;
    expect(DayItem.safeParse({ ...item, kind: "email" }).success).toBe(false);
    expect(DayItem.safeParse({ ...item, reason: "" }).success).toBe(false);
    expect(MyDay.safeParse({ items: [{ ...item, title: "" }] }).success).toBe(false);
    expect(PersonRef.safeParse({ id: "", name: "M" }).success).toBe(false);
    expect(StatusDecision.safeParse({ text: "x", meetingId: "nope" }).success).toBe(false);
    expect(ProjectStatus.safeParse({
      project, milestones: [], tasks: [], decisions: [], people: [],
    }).success).toBe(true);
    expect(ProjectStatus.safeParse({
      project: { ...project, name: "" }, milestones: [], tasks: [], decisions: [], people: [],
    }).success).toBe(false);
    expect(AccountStatus.safeParse({
      account, contacts: [], commitments: [], openTasks: [], recentMeetings: "none", people: [],
    }).success).toBe(false);
  });

  it("accepts ask requests and results", () => {
    expect(AskRequest.parse({ question: "  Status?  " }).question).toBe("Status?");
    expect(AskSourceType.parse("meeting")).toBe("meeting");
    const source = { type: "milestone", id: id(4), label: "Go-live" } as const;
    expect(AskSource.parse(source)).toBeTruthy();
    expect(AskResult.parse({
      answer: "Go-live moved to 22 Nov.", abstained: false, sources: [source],
    })).toBeTruthy();
    expect(AskResult.parse({
      answer: "I don't have a record of that.", abstained: true, sources: [],
    }).abstained).toBe(true);
  });

  it("rejects bad ask requests and results", () => {
    expect(AskRequest.safeParse({ question: "" }).success).toBe(false);
    expect(AskRequest.safeParse({ question: "   " }).success).toBe(false);
    expect(AskRequest.safeParse({ question: "x".repeat(ASK_QUESTION_MAX + 1) }).success).toBe(false);
    expect(AskRequest.safeParse({}).success).toBe(false);
    expect(AskSource.safeParse({ type: "contact", id: id(2), label: "Alex" }).success).toBe(false);
    expect(AskResult.safeParse({ answer: "Yes.", abstained: false, sources: [] }).success).toBe(false);
    expect(AskResult.safeParse({
      answer: "No record.", abstained: true,
      sources: [{ type: "task", id: id(11), label: "Fix it" }],
    }).success).toBe(false);
    expect(AskResult.safeParse({ answer: "", abstained: true, sources: [] }).success).toBe(false);
  });

  it("accepts both meeting-create variants", () => {
    expect(MeetingFixture.parse("acme-sync")).toBe("acme-sync");
    expect(MeetingCreateTranscript.parse({ zoneId: "acme_room", transcript: "hello" })).toBeTruthy();
    expect(MeetingCreateFixture.parse({ zoneId: "acme_room", fixture: "acme-sync" })).toBeTruthy();
    expect(MeetingCreate.parse({ zoneId: "project_room", fixture: "acme-sync" })).toBeTruthy();
    expect(MeetingCreate.parse({ zoneId: "project_room", transcript: "hello" })).toBeTruthy();
  });

  it("rejects bad meeting creates", () => {
    expect(MeetingCreate.safeParse({ zoneId: "", transcript: "x" }).success).toBe(false);
    expect(MeetingCreate.safeParse({ zoneId: "z", transcript: "   " }).success).toBe(false);
    expect(MeetingCreate.safeParse({ zoneId: "z", fixture: "other" }).success).toBe(false);
    expect(MeetingCreate.safeParse({ zoneId: "z" }).success).toBe(false);
    expect(MeetingCreate.safeParse({ zoneId: "z", transcript: "x", fixture: "acme-sync" }).success).toBe(false);
  });

  it("accepts the endpoint envelopes", () => {
    expect(MeetingProcessResult.parse({ meetingId: id(31), proposedChanges: [change] })).toBeTruthy();
    expect(ProposedChangeQuery.parse({})).toEqual({});
    expect(ProposedChangeQuery.parse({ status: "pending", meetingId: id(31) })).toBeTruthy();
    expect(ProposedChangeList.parse({ changes: [] }).changes).toEqual([]);
    expect(OkResult.parse({ ok: true })).toEqual({ ok: true });
  });

  it("rejects bad envelopes", () => {
    expect(MeetingProcessResult.safeParse({ meetingId: "x", proposedChanges: [] }).success).toBe(false);
    expect(ProposedChangeQuery.safeParse({ status: "draft" }).success).toBe(false);
    expect(ProposedChangeQuery.safeParse({ meetingId: "x" }).success).toBe(false);
    expect(ProposedChangeList.safeParse({ changes: [{ ...change, id: "x" }] }).success).toBe(false);
    expect(OkResult.safeParse({ ok: false }).success).toBe(false);
    expect(OkResult.safeParse({}).success).toBe(false);
  });

  it("re-exports the net RecordKind", () => {
    expect(RecordKind.parse("tasks")).toBe("tasks");
    expect(RecordKind.safeParse("accounts").success).toBe(false);
  });

  it("rejects unknown fields on every object schema", () => {
    const summary = { id: id(31), zoneId: "z", startedAt: 1, summary: "s" };
    const cases: [z.ZodType, unknown][] = [
      [Account, account],
      [Contact, contact],
      [Project, project],
      [Milestone, milestone],
      [Task, task],
      [Commitment, commitment],
      [Decision, { text: "x" }],
      [Meeting, meeting],
      [MeetingSummary, summary],
      [ProposedChange, change],
      [ExtractionResult, extraction],
      [DayItem, { id: id(1), kind: "task", title: "t", reason: "r", dueDate: null }],
      [MyDay, { items: [] }],
      [PersonRef, { id: "u", name: "n" }],
      [StatusDecision, { text: "x", meetingId: id(1) }],
      [ProjectStatus, { project, milestones: [], tasks: [], decisions: [], people: [] }],
      [AccountStatus, { account, contacts: [], commitments: [], openTasks: [], recentMeetings: [], people: [] }],
      [AskRequest, { question: "q" }],
      [AskSource, { type: "task", id: id(1), label: "l" }],
      [AskResult, { answer: "a", abstained: true, sources: [] }],
      [MeetingCreateTranscript, { zoneId: "z", transcript: "t" }],
      [MeetingCreateFixture, { zoneId: "z", fixture: "acme-sync" }],
      [MeetingProcessResult, { meetingId: id(1), proposedChanges: [] }],
      [ProposedChangeQuery, {}],
      [ProposedChangeList, { changes: [] }],
      [OkResult, { ok: true }],
    ];
    for (const [schema, value] of cases) {
      expect(schema.safeParse(value).success).toBe(true);
      expect(schema.safeParse({ ...(value as object), smuggled: 1 }).success).toBe(false);
    }
  });

  it("is re-exported from the package root (no `export *` name is dropped)", async () => {
    const root = await import("../index.js") as Record<string, unknown>;
    for (const name of ["RecordId", "Account", "Contact", "Project", "MilestoneStatus", "Milestone",
      "TaskStatus", "Task", "Commitment", "Decision", "Meeting", "MeetingSummary", "ChangeType",
      "ChangeStatus", "ProposedChange", "ExtractionResult", "DayItemKind", "DayItem", "MyDay",
      "PersonRef", "StatusDecision", "ProjectStatus", "AccountStatus", "ASK_QUESTION_MAX",
      "AskRequest", "AskSourceType", "AskSource", "AskResult", "MeetingFixture",
      "MeetingCreateTranscript", "MeetingCreateFixture", "MeetingCreate", "MeetingProcessResult",
      "ProposedChangeQuery", "ProposedChangeList", "OkResult", "RecordKind",
      "DemoPersonKey", "DemoPerson", "DEMO_PEOPLE", "DEMO_ACCOUNT", "DEMO_CONTACT", "DEMO_PROJECT",
      "DEMO_MILESTONE", "DEMO_TASKS", "DEMO_COMMITMENT", "RoomRecordKind", "RoomRecord",
      "ROOM_RECORDS", "ACME_SYNC_TRANSCRIPT", "FIXTURE_TRANSCRIPTS", "acmeSyncExpected",
      "DemoExpect", "DemoQuestion", "DEMO_QUESTIONS"]) {
      expect(root[name], name).not.toBeUndefined();
    }
  });
});
