import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  Account,
  AskRequest,
  Commitment,
  Contact,
  MeetingCreate,
  MeetingFixture,
  Milestone,
  Project,
  ProposedChange,
  Task,
} from "../api/index.js";
import { ZONES } from "../world/index.js";
import {
  ACME_SYNC_TRANSCRIPT,
  DEMO_ACCOUNT,
  DEMO_COMMITMENT,
  DEMO_CONTACT,
  DEMO_MILESTONE,
  DEMO_PEOPLE,
  DEMO_PROJECT,
  DEMO_QUESTIONS,
  DEMO_TASKS,
  DemoPerson,
  DemoQuestion,
  FIXTURE_TRANSCRIPTS,
  ROOM_RECORDS,
  RoomRecord,
  acmeSyncExpected,
} from "./index.js";

const MEETING_ID = "00000000-0000-4000-8000-000000000099";

describe("demo data", () => {
  it("parses every record with its schema", () => {
    expect(Account.parse(DEMO_ACCOUNT).name).toBe("Acme Corp");
    expect(Contact.parse(DEMO_CONTACT)).toBeTruthy();
    expect(Project.parse(DEMO_PROJECT).name).toBe("Acme Payments Integration");
    expect(Milestone.parse(DEMO_MILESTONE).targetDate).toBe("2026-11-15");
    expect(DEMO_TASKS).toHaveLength(3);
    for (const task of DEMO_TASKS) {
      expect(Task.parse(task)).toBeTruthy();
    }
    expect(Commitment.parse(DEMO_COMMITMENT).text).toBe("Go-live by 15 Nov");
    expect(z.array(DemoPerson).parse(DEMO_PEOPLE)).toHaveLength(2);
  });

  it("keeps ids unique and every reference resolving", () => {
    const ids = [DEMO_ACCOUNT, DEMO_CONTACT, DEMO_PROJECT, DEMO_MILESTONE, ...DEMO_TASKS, DEMO_COMMITMENT]
      .map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = new Set(DEMO_PEOPLE.map((p) => p.key));
    expect(keys).toEqual(new Set(["maya", "arjun"]));
    expect(DEMO_CONTACT.accountId).toBe(DEMO_ACCOUNT.id);
    expect(DEMO_PROJECT.accountId).toBe(DEMO_ACCOUNT.id);
    expect(DEMO_MILESTONE.projectId).toBe(DEMO_PROJECT.id);
    for (const task of DEMO_TASKS) {
      expect(task.projectId).toBe(DEMO_PROJECT.id);
      expect(task.accountId).toBeNull();
      expect(task.ownerId === null || keys.has(task.ownerId as "maya")).toBe(true);
    }
    expect(DEMO_TASKS.map((t) => t.title)).toEqual([
      "Fix webhook signature validation",
      "Write integration test suite",
      "Prepare Acme onboarding guide",
    ]);
    expect(DEMO_TASKS.map((t) => t.status)).toEqual(["blocked", "in_progress", "todo"]);
    expect(DEMO_COMMITMENT.accountId).toBe(DEMO_ACCOUNT.id);
    expect(DEMO_COMMITMENT.linkedMilestoneId).toBe(DEMO_MILESTONE.id);
    expect(keys.has(DEMO_ACCOUNT.ownerId as "maya")).toBe(true);
    expect(keys.has(DEMO_PROJECT.ownerId as "maya")).toBe(true);
  });

  it("maps each demo room onto a real zone of the right type", () => {
    expect(z.record(z.string(), RoomRecord).parse(ROOM_RECORDS)).toBeTruthy();
    expect(Object.keys(ROOM_RECORDS).sort()).toEqual(["acme_room", "project_room"]);
    for (const [zoneId, record] of Object.entries(ROOM_RECORDS)) {
      expect(record.zoneId).toBe(zoneId);
    }
    expect(ROOM_RECORDS.acme_room).toEqual(
      { zoneId: "acme_room", kind: "account", recordId: DEMO_ACCOUNT.id });
    expect(ROOM_RECORDS.project_room).toEqual(
      { zoneId: "project_room", kind: "project", recordId: DEMO_PROJECT.id });
    const zones = new Map(ZONES.map((zone) => [zone.id, zone]));
    expect(zones.get("acme_room")?.type).toBe("customer_room");
    expect(zones.get("project_room")?.type).toBe("project_room");
  });

  it("covers every meeting fixture with a transcript that supports the four changes", () => {
    for (const fixture of MeetingFixture.options) {
      expect(typeof FIXTURE_TRANSCRIPTS[fixture]).toBe("string");
      expect(FIXTURE_TRANSCRIPTS[fixture].length).toBeGreaterThan(0);
    }
    expect(MeetingCreate.parse({ zoneId: "acme_room", fixture: "acme-sync" })).toBeTruthy();
    expect(MeetingCreate.parse({ zoneId: "acme_room", transcript: ACME_SYNC_TRANSCRIPT })).toBeTruthy();
    for (const fact of ["vendor fix", "22 November", "Arjun", "Maya", "webhook", "notify Acme"]) {
      expect(ACME_SYNC_TRANSCRIPT).toContain(fact);
    }
  });

  it("produces exactly the four expected changes for the fixture meeting", () => {
    const changes = acmeSyncExpected(MEETING_ID);
    expect(z.array(ProposedChange).parse(changes)).toHaveLength(4);
    expect(changes.map((c) => c.type)).toEqual([
      "milestone_date", "commitment_update", "task_reassign", "task_create",
    ]);
    for (const change of changes) {
      expect(change.status).toBe("pending");
      expect(change.needsReview).toBe(false);
      expect(change.sourceMeetingId).toBe(MEETING_ID);
    }
    expect(new Set(changes.map((c) => c.id)).size).toBe(4);
    const [milestoneDate, commitmentUpdate, taskReassign, taskCreate] = changes;
    expect(milestoneDate.targetId).toBe(DEMO_MILESTONE.id);
    expect([milestoneDate.before, milestoneDate.after]).toEqual([
      { targetDate: "2026-11-15" }, { targetDate: "2026-11-22" },
    ]);
    expect(commitmentUpdate.targetId).toBe(DEMO_COMMITMENT.id);
    expect([commitmentUpdate.before, commitmentUpdate.after]).toEqual([
      { text: "Go-live by 15 Nov", dueDate: "2026-11-15" },
      { text: "Go-live by 22 Nov", dueDate: "2026-11-22" },
    ]);
    expect(taskReassign.targetId).toBe(DEMO_TASKS[0].id);
    expect([taskReassign.before, taskReassign.after]).toEqual([
      { ownerId: "maya" }, { ownerId: "arjun" },
    ]);
    expect(taskCreate.targetId).toBeNull();
    expect(taskCreate.before).toBeNull();
    expect(taskCreate.after).toEqual({
      title: "Notify Acme of new date",
      ownerId: "maya",
      projectId: DEMO_PROJECT.id,
      status: "todo",
    });
  });

  it("asks one answerable and one unanswerable demo question", () => {
    expect(z.array(DemoQuestion).parse(DEMO_QUESTIONS)).toHaveLength(2);
    expect(DEMO_QUESTIONS.map((q) => q.expect)).toEqual(["answer", "abstain"]);
    expect(DEMO_QUESTIONS[0].question).toBe("What's the status of the Acme integration?");
    expect(DEMO_QUESTIONS[1].question).toBe("Who is Acme's CEO?");
    for (const { question } of DEMO_QUESTIONS) {
      expect(AskRequest.parse({ question }).question).toBe(question);
    }
  });

  it("rejects bad demo people, room records and questions", () => {
    expect(DemoPerson.safeParse({ ...DEMO_PEOPLE[0], key: "boss" }).success).toBe(false);
    expect(DemoPerson.safeParse({ ...DEMO_PEOPLE[0], name: "" }).success).toBe(false);
    expect(RoomRecord.safeParse({ ...ROOM_RECORDS.acme_room, kind: "task" }).success).toBe(false);
    expect(RoomRecord.safeParse({ ...ROOM_RECORDS.acme_room, recordId: "nope" }).success).toBe(false);
    expect(DemoQuestion.safeParse({ ...DEMO_QUESTIONS[0], expect: "maybe" }).success).toBe(false);
    expect(DemoQuestion.safeParse({ ...DEMO_QUESTIONS[0], question: "  " }).success).toBe(false);
  });

  it("rejects unknown fields on every demo object schema", () => {
    const cases: [z.ZodType, unknown][] = [
      [DemoPerson, DEMO_PEOPLE[0]],
      [RoomRecord, ROOM_RECORDS.acme_room],
      [DemoQuestion, DEMO_QUESTIONS[0]],
    ];
    for (const [schema, value] of cases) {
      expect(schema.safeParse(value).success).toBe(true);
      expect(schema.safeParse({ ...(value as object), smuggled: 1 }).success).toBe(false);
    }
  });
});
