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

/** Phase 6 bounds (ARCHITECTURE.md 12.10): booking titles, agendas and invitee lists. */
export const BOOKING_TITLE_MAX = 120;
export const BOOKING_AGENDA_MAX = 2000;
export const BOOKING_INVITEES_MAX = 20;

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
  /** Phase 6 (P6-B): the booking's agenda, stored with the meeting when booked. */
  agenda: z.string().max(BOOKING_AGENDA_MAX).optional(),
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
  /** Phase 6 (P6-R): receipt chips render the source meeting and approver. */
  meetingLabel: z.string().trim().min(1).optional(),
  approverName: z.string().trim().min(1).optional(),
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
  /** Phase 6 (P6-B): the booking this meeting was processed from, if any. */
  bookingId: RecordId.optional(),
}).strict();
export type MeetingCreateTranscript = z.infer<typeof MeetingCreateTranscript>;

export const MeetingCreateFixture = z.object({
  zoneId: z.string().min(1),
  fixture: MeetingFixture,
  /** Phase 6 (P6-B): the booking this meeting was processed from, if any. */
  bookingId: RecordId.optional(),
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

// Phase 6: office life (ARCHITECTURE.md 12.10).

export const BookingStatus = z.enum(["open", "ended"]);
export type BookingStatus = z.infer<typeof BookingStatus>;

/**
 * A booked meeting (P6-B). Only meeting, customer and project rooms can be booked, one open
 * booking per zone; `zoneId: null` is a virtual call-only meeting. `title` is 1 to 120
 * characters, `agenda` 0 to 2000, `inviteeIds` 1 to 20 people. `hostId` and `inviteeIds`
 * are opaque user ids, like `ownerId`. `createdAt`/`endedAt` are ms since the epoch.
 */
export const Booking = z.object({
  id: RecordId,
  workspaceId: z.string().min(1),
  zoneId: z.string().min(1).nullable(),
  title: z.string().trim().min(1).max(BOOKING_TITLE_MAX),
  agenda: z.string().max(BOOKING_AGENDA_MAX),
  hostId: z.string().min(1),
  inviteeIds: z.array(z.string().min(1)).min(1).max(BOOKING_INVITEES_MAX),
  status: BookingStatus,
  createdAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative().nullable(),
}).strict();
export type Booking = z.infer<typeof Booking>;

/** `POST /bookings` takes this; the server stamps the id, host, status and times. */
export const BookingCreate = z.object({
  zoneId: z.string().min(1).nullable(),
  title: z.string().trim().min(1).max(BOOKING_TITLE_MAX),
  agenda: z.string().max(BOOKING_AGENDA_MAX),
  inviteeIds: z.array(z.string().min(1)).min(1).max(BOOKING_INVITEES_MAX),
}).strict();
export type BookingCreate = z.infer<typeof BookingCreate>;

/** `GET /bookings?status=open` answers with this list. */
export const BookingList = z.object({
  bookings: z.array(Booking),
}).strict();
export type BookingList = z.infer<typeof BookingList>;

/** A personal note (P6-C): private to its author, never broadcast. */
export const Note = z.object({
  id: RecordId,
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  text: z.string().trim().min(1),
  color: z.string().trim().min(1),
  done: z.boolean(),
  createdAt: z.number().int().nonnegative(),
}).strict();
export type Note = z.infer<typeof Note>;

/** `POST /notes` takes this; the server stamps the id, owner and time, `done` starts false. */
export const NoteCreate = z.object({
  text: z.string().trim().min(1),
  color: z.string().trim().min(1),
}).strict();
export type NoteCreate = z.infer<typeof NoteCreate>;

/** `PATCH /notes/:id` takes any subset of these fields. */
export const NoteUpdate = z.object({
  text: z.string().trim().min(1).optional(),
  color: z.string().trim().min(1).optional(),
  done: z.boolean().optional(),
}).strict();
export type NoteUpdate = z.infer<typeof NoteUpdate>;

/** `GET /notes` answers with this list. */
export const NoteList = z.object({
  notes: z.array(Note),
}).strict();
export type NoteList = z.infer<typeof NoteList>;

/** A company-board pin (P6-D): workspace-visible, drawn on the cork board. */
export const BoardPin = z.object({
  id: RecordId,
  workspaceId: z.string().min(1),
  authorId: z.string().min(1),
  authorName: z.string().trim().min(1),
  text: z.string().trim().min(1),
  color: z.string().trim().min(1),
  createdAt: z.number().int().nonnegative(),
}).strict();
export type BoardPin = z.infer<typeof BoardPin>;

/** `POST /board` takes this; the server stamps the id, author and time. */
export const BoardPinCreate = z.object({
  text: z.string().trim().min(1),
  color: z.string().trim().min(1),
}).strict();
export type BoardPinCreate = z.infer<typeof BoardPinCreate>;

/** `GET /board` answers with this list. */
export const BoardPinList = z.object({
  pins: z.array(BoardPin),
}).strict();
export type BoardPinList = z.infer<typeof BoardPinList>;

export const ReceiptDecision = z.enum(["approved", "rejected"]);
export type ReceiptDecision = z.infer<typeof ReceiptDecision>;

/**
 * One decided change (P6-R, USP A Phase 0): the record, its before and after, the source
 * meeting, the decision, who decided and when. `GET /receipts` composes these from the
 * existing reads (audit rows, changes, meetings, people), so they add no table.
 */
export const Receipt = z.object({
  changeId: RecordId,
  kind: ChangeType,
  recordType: AskSourceType,
  recordId: RecordId,
  recordLabel: z.string().trim().min(1),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()),
  meetingId: RecordId,
  meetingLabel: z.string().trim().min(1),
  decision: ReceiptDecision,
  deciderId: z.string().min(1),
  deciderName: z.string().trim().min(1),
  decidedAt: z.number().int().nonnegative(),
}).strict();
export type Receipt = z.infer<typeof Receipt>;

/** `GET /receipts?accountId=&projectId=&limit=` takes these, all optional. */
export const ReceiptQuery = z.object({
  accountId: RecordId.optional(),
  projectId: RecordId.optional(),
  limit: z.number().int().positive().optional(),
}).strict();
export type ReceiptQuery = z.infer<typeof ReceiptQuery>;

/** `GET /receipts` answers with this list, newest first. */
export const ReceiptList = z.object({
  receipts: z.array(Receipt),
}).strict();
export type ReceiptList = z.infer<typeof ReceiptList>;
