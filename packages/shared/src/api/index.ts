import { z } from "zod";

/**
 * The HTTP contract (ARCHITECTURE.md section 5): record, change, extraction, status and ask
 * shapes. Every object schema is `.strict()`: unknown fields are rejected, so HTTP bodies and
 * LLM output fail loudly instead of smuggling state (ARCHITECTURE.md section 9).
 *
 * Record ids are stable UUIDs. User references (`ownerId`, `PersonRef.id`) are opaque strings:
 * a demo person key (`maya`, `arjun`) in fixture data, a database UUID in production (12.4).
 * The workspace always comes from the token, never from these payloads.
 *
 * `RecordKind` (which queries to refetch on `records_changed`) is defined in `src/net` and
 * re-exported here so HTTP code imports the whole contract from one place.
 */

export { RecordKind } from "../net/index.js";

/** Stable record ids, shared by the in-memory repo, the mock API and the seed. */
export const RecordId = z.string().uuid();
export type RecordId = z.infer<typeof RecordId>;

// Records (ARCHITECTURE.md section 6).

export const Account = z.object({
  id: RecordId,
  name: z.string().trim().min(1),
  dealStage: z.string().trim().min(1),
  ownerId: z.string().min(1),
}).strict();
export type Account = z.infer<typeof Account>;

export const Contact = z.object({
  id: RecordId,
  accountId: RecordId,
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
}).strict();
export type Contact = z.infer<typeof Contact>;

export const Project = z.object({
  id: RecordId,
  accountId: RecordId,
  name: z.string().trim().min(1),
  ownerId: z.string().min(1),
}).strict();
export type Project = z.infer<typeof Project>;

export const MilestoneStatus = z.enum(["upcoming", "done"]);
export type MilestoneStatus = z.infer<typeof MilestoneStatus>;

export const Milestone = z.object({
  id: RecordId,
  projectId: RecordId,
  name: z.string().trim().min(1),
  targetDate: z.string().min(1),
  status: MilestoneStatus,
  sourceMeetingId: RecordId.nullable(),
}).strict();
export type Milestone = z.infer<typeof Milestone>;

export const TaskStatus = z.enum(["todo", "in_progress", "blocked", "done"]);
export type TaskStatus = z.infer<typeof TaskStatus>;

/** A task belongs to a project or to an account, never both and never neither. */
export const Task = z.object({
  id: RecordId,
  projectId: RecordId.nullable(),
  accountId: RecordId.nullable(),
  title: z.string().trim().min(1),
  ownerId: z.string().min(1).nullable(),
  dueDate: z.string().min(1).nullable(),
  status: TaskStatus,
  blockedReason: z.string().trim().min(1).nullable(),
  sourceMeetingId: RecordId.nullable(),
}).strict().refine((t) => (t.projectId === null) !== (t.accountId === null), {
  message: "a task belongs to exactly one of a project or an account",
});
export type Task = z.infer<typeof Task>;

export const Commitment = z.object({
  id: RecordId,
  accountId: RecordId,
  text: z.string().trim().min(1),
  dueDate: z.string().min(1).nullable(),
  linkedTaskId: RecordId.nullable(),
  linkedMilestoneId: RecordId.nullable(),
  sourceMeetingId: RecordId.nullable(),
}).strict();
export type Commitment = z.infer<typeof Commitment>;

export const Decision = z.object({
  text: z.string().trim().min(1),
}).strict();
export type Decision = z.infer<typeof Decision>;

/** `startedAt` is ms since the epoch, like `ChatMessage.ts`. */
export const Meeting = z.object({
  id: RecordId,
  zoneId: z.string().min(1),
  startedAt: z.number().int().nonnegative(),
  transcript: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  decisions: z.array(Decision),
}).strict();
export type Meeting = z.infer<typeof Meeting>;

/** A meeting without its transcript, for status lists. */
export const MeetingSummary = z.object({
  id: RecordId,
  zoneId: z.string().min(1),
  startedAt: z.number().int().nonnegative(),
  summary: z.string().trim().min(1),
}).strict();
export type MeetingSummary = z.infer<typeof MeetingSummary>;

// Proposed changes: the AI proposes, a person approves. `before` and `after` hold the changed
// fields only (`before` is null for creates); `targetId` is null when no record matched.

export const ChangeType = z.enum([
  "milestone_date",
  "commitment_update",
  "commitment_create",
  "task_create",
  "task_update",
  "task_reassign",
]);
export type ChangeType = z.infer<typeof ChangeType>;

export const ChangeStatus = z.enum(["pending", "approved", "rejected"]);
export type ChangeStatus = z.infer<typeof ChangeStatus>;

const ChangeFields = z.record(z.string(), z.unknown());

export const ProposedChange = z.object({
  id: RecordId,
  type: ChangeType,
  status: ChangeStatus,
  targetId: RecordId.nullable(),
  before: ChangeFields.nullable(),
  after: ChangeFields,
  needsReview: z.boolean(),
  sourceMeetingId: RecordId,
}).strict();
export type ProposedChange = z.infer<typeof ProposedChange>;

// Extraction (ARCHITECTURE.md section 7).

export const ExtractionResult = z.object({
  summary: z.string().trim().min(1),
  decisions: z.array(Decision),
  tasks: z.array(z.object({
    title: z.string().trim().min(1),
    ownerName: z.string().trim().min(1).optional(),
    dueDate: z.string().min(1).optional(),
    action: z.enum(["create", "update"]),
    matchHint: z.string().trim().min(1).optional(),
  }).strict()),
  commitments: z.array(z.object({
    text: z.string().trim().min(1),
    accountName: z.string().trim().min(1),
    dueDate: z.string().min(1).optional(),
  }).strict()),
  milestoneChanges: z.array(z.object({
    projectName: z.string().trim().min(1),
    milestoneName: z.string().trim().min(1),
    newTargetDate: z.string().min(1),
  }).strict()),
}).strict();
export type ExtractionResult = z.infer<typeof ExtractionResult>;

// Statuses (ARCHITECTURE.md section 5). `people` resolves the `ownerId`s the records carry.

export const DayItemKind = z.enum(["task", "meeting", "followup"]);
export type DayItemKind = z.infer<typeof DayItemKind>;

/** One row of "my day": `id` is the underlying task, meeting or commitment. */
export const DayItem = z.object({
  id: RecordId,
  kind: DayItemKind,
  title: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  dueDate: z.string().min(1).nullable(),
}).strict();
export type DayItem = z.infer<typeof DayItem>;

export const MyDay = z.object({
  items: z.array(DayItem),
}).strict();
export type MyDay = z.infer<typeof MyDay>;

export const PersonRef = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
}).strict();
export type PersonRef = z.infer<typeof PersonRef>;

export const StatusDecision = z.object({
  text: z.string().trim().min(1),
  meetingId: RecordId,
}).strict();
export type StatusDecision = z.infer<typeof StatusDecision>;

/** Blockers are the tasks whose status is `blocked`; owners resolve through `people`. */
export const ProjectStatus = z.object({
  project: Project,
  milestones: z.array(Milestone),
  tasks: z.array(Task),
  decisions: z.array(StatusDecision),
  people: z.array(PersonRef),
}).strict();
export type ProjectStatus = z.infer<typeof ProjectStatus>;

export const AccountStatus = z.object({
  account: Account,
  contacts: z.array(Contact),
  commitments: z.array(Commitment),
  openTasks: z.array(Task),
  recentMeetings: z.array(MeetingSummary),
  people: z.array(PersonRef),
}).strict();
export type AccountStatus = z.infer<typeof AccountStatus>;

// Ask (ARCHITECTURE.md sections 5 and 8). An abstention carries no sources; an answer cites
// at least one record, and every cited id must be in the retrieved set (checked by the pipeline).

export const ASK_QUESTION_MAX = 1000;

export const AskRequest = z.object({
  question: z.string().trim().min(1).max(ASK_QUESTION_MAX),
}).strict();
export type AskRequest = z.infer<typeof AskRequest>;

export const AskSourceType = z.enum(["task", "milestone", "commitment", "meeting", "account", "project"]);
export type AskSourceType = z.infer<typeof AskSourceType>;

export const AskSource = z.object({
  type: AskSourceType,
  id: RecordId,
  label: z.string().trim().min(1),
}).strict();
export type AskSource = z.infer<typeof AskSource>;

export const AskResult = z.object({
  answer: z.string().trim().min(1),
  abstained: z.boolean(),
  sources: z.array(AskSource),
}).strict().refine((r) => (r.abstained ? r.sources.length === 0 : r.sources.length > 0), {
  message: "an abstention carries no sources; an answer cites at least one",
});
export type AskResult = z.infer<typeof AskResult>;

// Meeting creation and endpoint envelopes (ARCHITECTURE.md section 5).

export const MeetingFixture = z.enum(["acme-sync"]);
export type MeetingFixture = z.infer<typeof MeetingFixture>;

export const MeetingCreateTranscript = z.object({
  zoneId: z.string().min(1),
  transcript: z.string().trim().min(1),
}).strict();
export type MeetingCreateTranscript = z.infer<typeof MeetingCreateTranscript>;

export const MeetingCreateFixture = z.object({
  zoneId: z.string().min(1),
  fixture: MeetingFixture,
}).strict();
export type MeetingCreateFixture = z.infer<typeof MeetingCreateFixture>;

export const MeetingCreate = z.union([MeetingCreateTranscript, MeetingCreateFixture]);
export type MeetingCreate = z.infer<typeof MeetingCreate>;

/** `POST /meetings` answers with the meeting and what extraction proposed. */
export const MeetingProcessResult = z.object({
  meetingId: RecordId,
  proposedChanges: z.array(ProposedChange),
}).strict();
export type MeetingProcessResult = z.infer<typeof MeetingProcessResult>;

/** `GET /proposed-changes?status=&meetingId=` (both optional) answers with this list. */
export const ProposedChangeQuery = z.object({
  status: ChangeStatus.optional(),
  meetingId: RecordId.optional(),
}).strict();
export type ProposedChangeQuery = z.infer<typeof ProposedChangeQuery>;

export const ProposedChangeList = z.object({
  changes: z.array(ProposedChange),
}).strict();
export type ProposedChangeList = z.infer<typeof ProposedChangeList>;

/** `POST /proposed-changes/:id/approve` and `/reject` answer with this. */
export const OkResult = z.object({
  ok: z.literal(true),
}).strict();
export type OkResult = z.infer<typeof OkResult>;

// Live calls (Phase 5, ARCHITECTURE.md 12.9).

/** `POST /calls/token`: the caller's zone is verified server-side, never trusted. */
export const CallTokenRequest = z.object({
  zoneId: z.string().min(1),
}).strict();
export type CallTokenRequest = z.infer<typeof CallTokenRequest>;

/** `POST /calls/token` answers with the LiveKit URL and a scoped token. */
export const CallTokenResponse = z.object({
  url: z.string().min(1),
  token: z.string().min(1),
}).strict();
export type CallTokenResponse = z.infer<typeof CallTokenResponse>;
