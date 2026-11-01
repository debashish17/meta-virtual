import { z } from "zod";
import {
  MeetingFixture,
  ProposedChange,
  type Account,
  type Commitment,
  type Contact,
  type Milestone,
  type Project,
  type Task,
} from "../api/index.js";

/**
 * The demo data (PROJECT_BRIEF.md section 5): the single source for the seed (P2-C),
 * `FixtureLlm` (P2-D) and the web's mock API (P1-C). Northwind Software, the Acme account and
 * project, Maya and Arjun, the `acme-sync` transcript and the four changes it must produce.
 *
 * People are identified by `key` (`maya`, `arjun`); the database assigns their ids (12.4).
 * Records carry stable UUIDs, used by the in-memory repo, the mock API and the seed alike.
 */

export const DemoPersonKey = z.enum(["maya", "arjun"]);
export type DemoPersonKey = z.infer<typeof DemoPersonKey>;

export const DemoPerson = z.object({
  key: DemoPersonKey,
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
}).strict();
export type DemoPerson = z.infer<typeof DemoPerson>;

export const DEMO_PEOPLE: DemoPerson[] = [
  { key: "maya", name: "Maya", role: "Customer success lead" },
  { key: "arjun", name: "Arjun", role: "Integration engineer" },
];

export const DEMO_ACCOUNT: Account = {
  id: "ac0e0001-0001-4001-8001-000000000001",
  name: "Acme Corp",
  dealStage: "Implementation",
  ownerId: "maya",
};

export const DEMO_CONTACT: Contact = {
  id: "ac0e0002-0002-4002-8002-000000000002",
  accountId: DEMO_ACCOUNT.id,
  name: "Alex Morgan",
  role: "Operations manager",
};

export const DEMO_PROJECT: Project = {
  id: "ac0e0003-0003-4003-8003-000000000003",
  accountId: DEMO_ACCOUNT.id,
  name: "Acme Payments Integration",
  ownerId: "arjun",
};

export const DEMO_MILESTONE: Milestone = {
  id: "ac0e0004-0004-4004-8004-000000000004",
  projectId: DEMO_PROJECT.id,
  name: "Go-live",
  targetDate: "2026-11-15",
  status: "upcoming",
  sourceMeetingId: null,
};

export const DEMO_TASKS: Task[] = [
  {
    id: "ac0e0011-0011-4011-8011-000000000011",
    projectId: DEMO_PROJECT.id,
    accountId: null,
    title: "Fix webhook signature validation",
    ownerId: "maya",
    dueDate: "2026-11-14",
    status: "blocked",
    blockedReason: "Waiting on the vendor fix",
    sourceMeetingId: null,
  },
  {
    id: "ac0e0012-0012-4012-8012-000000000012",
    projectId: DEMO_PROJECT.id,
    accountId: null,
    title: "Write integration test suite",
    ownerId: "arjun",
    dueDate: "2026-11-20",
    status: "in_progress",
    blockedReason: null,
    sourceMeetingId: null,
  },
  {
    id: "ac0e0013-0013-4013-8013-000000000013",
    projectId: DEMO_PROJECT.id,
    accountId: null,
    title: "Prepare Acme onboarding guide",
    ownerId: "maya",
    dueDate: "2026-11-21",
    status: "todo",
    blockedReason: null,
    sourceMeetingId: null,
  },
];

export const DEMO_COMMITMENT: Commitment = {
  id: "ac0e0021-0021-4021-8021-000000000021",
  accountId: DEMO_ACCOUNT.id,
  text: "Go-live by 15 Nov",
  dueDate: "2026-11-15",
  linkedTaskId: null,
  linkedMilestoneId: DEMO_MILESTONE.id,
  sourceMeetingId: null,
};

// Rooms: which account or project each room shows on its wall and processes meetings for.

export const RoomRecordKind = z.enum(["account", "project"]);
export type RoomRecordKind = z.infer<typeof RoomRecordKind>;

export const RoomRecord = z.object({
  zoneId: z.string().min(1),
  kind: RoomRecordKind,
  recordId: z.string().uuid(),
}).strict();
export type RoomRecord = z.infer<typeof RoomRecord>;

export const ROOM_RECORDS: Record<string, RoomRecord> = {
  acme_room: { zoneId: "acme_room", kind: "account", recordId: DEMO_ACCOUNT.id },
  project_room: { zoneId: "project_room", kind: "project", recordId: DEMO_PROJECT.id },
};

// The fixture meeting: transcript plus the four proposed changes it must produce.

export const ACME_SYNC_TRANSCRIPT = [
  "Maya: Thanks for joining this Acme sync. Quick round: where are we on the Payments Integration?",
  "Arjun: The integration test suite is in progress, should be done next week. But webhook signature validation is blocked: it depends on a vendor fix, and their support just told me it will not land before the 20th.",
  "Maya: Then the 15th is gone. The Go-live milestone is still 15 November, which we cannot make any more. Let's move go-live to 22 November.",
  "Arjun: Agreed. I'll take over the blocked task so you can focus on the customer side: reassign 'Fix webhook signature validation' to me.",
  "Maya: And I will notify Acme of the new date today. To confirm: go-live moves to 22 Nov, Arjun owns the webhook fix, and I own the Acme update.",
].join("\n");

/** Every fixture id in `MeetingFixture` has its transcript here; the type forces it. */
export const FIXTURE_TRANSCRIPTS: Record<z.infer<typeof MeetingFixture>, string> = {
  "acme-sync": ACME_SYNC_TRANSCRIPT,
};

const ACME_CHANGE_IDS = {
  milestoneDate: "ac0e0031-0031-4031-8031-000000000031",
  commitmentUpdate: "ac0e0032-0032-4032-8032-000000000032",
  taskReassign: "ac0e0033-0033-4033-8033-000000000033",
  taskCreate: "ac0e0034-0034-4034-8034-000000000034",
} as const;

/**
 * The four changes the `acme-sync` transcript must produce, stamped with the meeting that
 * produced them. Change ids are stable so the seed, the mock API and the tests agree.
 */
export function acmeSyncExpected(meetingId: string): ProposedChange[] {
  return z.array(ProposedChange).parse([
    {
      id: ACME_CHANGE_IDS.milestoneDate,
      type: "milestone_date",
      status: "pending",
      targetId: DEMO_MILESTONE.id,
      before: { targetDate: "2026-11-15" },
      after: { targetDate: "2026-11-22" },
      needsReview: false,
      sourceMeetingId: meetingId,
    },
    {
      id: ACME_CHANGE_IDS.commitmentUpdate,
      type: "commitment_update",
      status: "pending",
      targetId: DEMO_COMMITMENT.id,
      before: { text: "Go-live by 15 Nov", dueDate: "2026-11-15" },
      after: { text: "Go-live by 22 Nov", dueDate: "2026-11-22" },
      needsReview: false,
      sourceMeetingId: meetingId,
    },
    {
      id: ACME_CHANGE_IDS.taskReassign,
      type: "task_reassign",
      status: "pending",
      targetId: DEMO_TASKS[0].id,
      before: { ownerId: "maya" },
      after: { ownerId: "arjun" },
      needsReview: false,
      sourceMeetingId: meetingId,
    },
    {
      id: ACME_CHANGE_IDS.taskCreate,
      type: "task_create",
      status: "pending",
      targetId: null,
      before: null,
      after: {
        title: "Notify Acme of new date",
        ownerId: "maya",
        projectId: DEMO_PROJECT.id,
        status: "todo",
      },
      needsReview: false,
      sourceMeetingId: meetingId,
    },
  ]);
}

// The two demo questions and their expected outcomes.

export const DemoExpect = z.enum(["answer", "abstain"]);
export type DemoExpect = z.infer<typeof DemoExpect>;

export const DemoQuestion = z.object({
  id: z.string().min(1),
  question: z.string().trim().min(1),
  expect: DemoExpect,
}).strict();
export type DemoQuestion = z.infer<typeof DemoQuestion>;

export const DEMO_QUESTIONS: DemoQuestion[] = [
  { id: "acme-status", question: "What's the status of the Acme integration?", expect: "answer" },
  { id: "acme-ceo", question: "Who is Acme's CEO?", expect: "abstain" },
];
