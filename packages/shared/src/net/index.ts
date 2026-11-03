import { z } from "zod";
import { AvatarLook } from "../people/look.js";
import { PoseSchema } from "../people/pose.js";

/**
 * The multiplayer contract (ARCHITECTURE.md section 4): what the browser and the Colyseus room
 * send each other, and the shape of the synced state. Every object schema is `.strict()`: unknown
 * fields are rejected, so a stale or tampered client fails loudly instead of smuggling state.
 *
 * `seq` counts the client's ticks: every input message (`move_intent`, `move_target`, `go_to`,
 * `activity_start`, `activity_stop`) carries the tick it was made on. The server records `lastSeq`,
 * the seq of the last input it applied for that player, in the synced state; the client reconciles
 * its prediction against the snapshot's `lastSeq` (ARCHITECTURE.md 12.1).
 *
 * The access token is never in these payloads: the SDK carries it as `client.auth.token` and the
 * server reads it in `static onAuth`. `workspaceId` in the join options is only the matchmaking
 * key; authorization comes from the token.
 */

/** Bumped whenever this contract changes incompatibly; the server refuses other protocols. */
export const PROTOCOL_VERSION = 2;

/** Server tick and client prediction rate; one step is `TICK_DT` seconds. */
export const TICK_HZ = 20;
export const TICK_DT = 1 / TICK_HZ;

/** How far behind the latest snapshot remote players are drawn (interpolation buffer). */
export const INTERP_DELAY_MS = 100;

/** A bigger position change between two snapshots is a jump (sit down, stand up): snap, never slide. */
export const SNAP_DISTANCE = 0.3;

/** Per-connection limits; anything above is dropped and answered with `rate_limited`. */
export const MOVE_RATE_PER_SECOND = 30;
export const CHAT_RATE_MAX = 5;
export const CHAT_RATE_WINDOW_S = 10;

/** How long a disconnected player (and their seat reservation) survives for a reconnect. */
export const RECONNECT_SECONDS = 20;

/** Proximity hysteresis: enter within 3 m, leave past 4 m. */
export const PROXIMITY_ENTER_M = 3;
export const PROXIMITY_LEAVE_M = 4;

/** Display names and chat text, after trimming. */
export const DISPLAY_NAME_MIN = 1;
export const DISPLAY_NAME_MAX = 40;
export const CHAT_TEXT_MAX = 500;

/** Chat messages replayed to a client on join. */
export const CHAT_HISTORY_MAX = 50;

/** The client's tick counter; see the note at the top of this file. */
export const Seq = z.number().int().nonnegative();
export type Seq = z.infer<typeof Seq>;

/** One world axis of a held-key intent. */
export const Axis = z.union([z.literal(-1), z.literal(0), z.literal(1)]);
export type Axis = z.infer<typeof Axis>;

export const JoinOptions = z.object({
  protocol: z.number().int(),
  displayName: z.string().trim().min(DISPLAY_NAME_MIN).max(DISPLAY_NAME_MAX),
  workspaceId: z.string().min(1),
  look: AvatarLook,
}).strict();
export type JoinOptions = z.infer<typeof JoinOptions>;

/** What a verified token resolves to, in both auth modes; the `Repo` takes it on every call. */
export const AuthClaims = z.object({
  userId: z.string().min(1),
  name: z.string().min(1),
  workspaceId: z.string().min(1),
}).strict();
export type AuthClaims = z.infer<typeof AuthClaims>;

// Client to server.

/** Held keys on world axes, sent at `TICK_HZ` while held and once more on release. */
export const MoveIntent = z.object({
  seq: Seq,
  dx: Axis,
  dz: Axis,
  run: z.boolean(),
}).strict();
export type MoveIntent = z.infer<typeof MoveIntent>;

/** A floor click; the server routes with `findPath` and rejects unwalkable targets. */
export const MoveTarget = z.object({
  seq: Seq,
  x: z.number().finite(),
  z: z.number().finite(),
}).strict();
export type MoveTarget = z.infer<typeof MoveTarget>;

/** A desk seat id (`seat:x,z`) or a counter spot id; the server checks it is known and free. */
export const ActivityStart = z.object({
  seq: Seq,
  targetId: z.string().min(1),
}).strict();
export type ActivityStart = z.infer<typeof ActivityStart>;

export const ActivityStop = z.object({
  seq: Seq,
}).strict();
export type ActivityStop = z.infer<typeof ActivityStop>;

export const ChatSend = z.object({
  text: z.string().trim().min(1).max(CHAT_TEXT_MAX),
}).strict();
export type ChatSend = z.infer<typeof ChatSend>;

/**
 * Ask for the recent chat. History is pulled, not pushed on join: a join-time push
 * can arrive before the client registers its handler and gets dropped with a
 * warning, so the client requests it once its handlers are attached.
 */
export const HistoryRequest = z.object({}).strict();
export type HistoryRequest = z.infer<typeof HistoryRequest>;

/**
 * DEV ONLY (`__officeDebug.teleport`): move the sender instantly. The server refuses
 * it in production and rejects unwalkable targets, so the no-walls invariant holds.
 */
export const TeleportAdmin = z.object({
  x: z.number().finite(),
  z: z.number().finite(),
}).strict();
export type TeleportAdmin = z.infer<typeof TeleportAdmin>;

/** One caption segment from the browser speech recognizer (Phase 5). */
export const CaptionSend = z.object({
  text: z.string().trim().min(1).max(CHAT_TEXT_MAX),
  final: z.boolean(),
  ts: z.number().int().nonnegative(),
}).strict();
export type CaptionSend = z.infer<typeof CaptionSend>;

export const Status = z.enum(["available", "working", "on_break", "in_meeting", "away"]);
export type Status = z.infer<typeof Status>;

export const StatusSet = z.object({
  status: Status,
}).strict();
export type StatusSet = z.infer<typeof StatusSet>;

export const LookSet = z.object({
  look: AvatarLook,
}).strict();
export type LookSet = z.infer<typeof LookSet>;

export const GoToPlace = z.enum(["desk", "break"]);
export type GoToPlace = z.infer<typeof GoToPlace>;

/**
 * Phase 6: status decides where a person is (ARCHITECTURE.md 12.10). The server sets the
 * status (`desk` gives `working`, `break` gives `on_break`) and walks the player there
 * through the activity pipeline: home desk (sit, type) or the nearest free counter spot.
 * `status_set` never moves anyone. A player with no home desk gets the status only, and
 * `error no_home_desk`.
 */
export const GoTo = z.object({
  seq: Seq,
  place: GoToPlace,
}).strict();
export type GoTo = z.infer<typeof GoTo>;

// Server to client.

export const ChatMessage = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().min(1),
  text: z.string().min(1).max(CHAT_TEXT_MAX),
  ts: z.number().int().nonnegative(),
}).strict();
export type ChatMessage = z.infer<typeof ChatMessage>;

/** The last `CHAT_HISTORY_MAX` messages, sent on join. */
export const ChatHistory = z.object({
  messages: z.array(ChatMessage).max(CHAT_HISTORY_MAX),
}).strict();
export type ChatHistory = z.infer<typeof ChatHistory>;

/** A caption broadcast to the people in the speaker's zone (Phase 5). */
export const Caption = z.object({
  name: z.string().min(1),
  text: z.string().min(1).max(CHAT_TEXT_MAX),
  final: z.boolean(),
  ts: z.number().int().nonnegative(),
}).strict();
export type Caption = z.infer<typeof Caption>;

/** Someone entered or left a named zone (`zoneId` is the zone entered or left). */
export const ZoneEvent = z.object({
  userId: z.string().min(1),
  zoneId: z.string().min(1),
  kind: z.enum(["enter", "leave"]),
}).strict();
export type ZoneEvent = z.infer<typeof ZoneEvent>;

/** Which queries to refetch; the HTTP contract (`src/api`) re-exports this. */
export const RecordKind = z.enum(["tasks", "milestones", "commitments", "proposed_changes", "meetings", "bookings", "board"]);
export type RecordKind = z.infer<typeof RecordKind>;

export const RecordsChanged = z.object({
  kinds: z.array(RecordKind),
}).strict();
export type RecordsChanged = z.infer<typeof RecordsChanged>;

/**
 * Phase 6: after a booking is created, each connected invitee gets one of these
 * (ARCHITECTURE.md 12.10). `zoneId` is null for a virtual call-only meeting.
 */
export const MeetingInvite = z.object({
  bookingId: z.string().uuid(),
  zoneId: z.string().min(1).nullable(),
  title: z.string().trim().min(1).max(120),
  hostName: z.string().trim().min(1),
}).strict();
export type MeetingInvite = z.infer<typeof MeetingInvite>;

export const ErrorCode = z.enum([
  "invalid_message",
  "rate_limited",
  "unwalkable",
  "target_taken",
  "unauthorized",
  "protocol_mismatch",
  "no_home_desk",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ServerError = z.object({
  code: ErrorCode,
  message: z.string().min(1),
}).strict();
export type ServerError = z.infer<typeof ServerError>;

// Synced state. Plain Zod schemas whose inferred types the server's Colyseus schema mirrors,
// field for field (P1-C keeps a test that the names match).

export const PlayerActivity = z.object({
  kind: z.enum(["seat", "counter"]),
  targetId: z.string().min(1),
}).strict();
export type PlayerActivity = z.infer<typeof PlayerActivity>;

export const PlayerView = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().min(1),
  look: AvatarLook,
  x: z.number().finite(),
  z: z.number().finite(),
  facing: z.number().finite(),
  pose: PoseSchema,
  speed: z.number().finite().nonnegative(),
  activity: PlayerActivity.nullable(),
  status: Status,
  zoneId: z.string().min(1).nullable(),
  lastSeq: z.number().int().nonnegative(),
}).strict();
export type PlayerView = z.infer<typeof PlayerView>;

export const NpcView = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  look: AvatarLook,
  x: z.number().finite(),
  z: z.number().finite(),
  facing: z.number().finite(),
  pose: PoseSchema,
  speed: z.number().finite().nonnegative(),
}).strict();
export type NpcView = z.infer<typeof NpcView>;

/** Message names on the wire, so neither side spells them by hand. */
export const CLIENT_MESSAGE = {
  moveIntent: "move_intent",
  moveTarget: "move_target",
  activityStart: "activity_start",
  activityStop: "activity_stop",
  chatSend: "chat_send",
  historyRequest: "history_request",
  teleportAdmin: "teleport_admin",
  captionSend: "caption_send",
  statusSet: "status_set",
  lookSet: "look_set",
  goTo: "go_to",
} as const;

export const SERVER_MESSAGE = {
  chat: "chat",
  chatHistory: "chat_history",
  caption: "caption",
  zoneEvent: "zone_event",
  recordsChanged: "records_changed",
  meetingInvite: "meeting_invite",
  error: "error",
} as const;

/**
 * Held screen directions to a world-axes intent for `move_intent`. The camera looks at the floor
 * corner-on, so screen up walks up the screen (+1, -1) on (x, z) and screen right walks (+1, +1);
 * each axis is clamped to -1 | 0 | 1. Matches the avatar's continuous mapping (Avatar.tsx).
 */
export function screenToIntent(sx: Axis, sy: Axis): { dx: Axis; dz: Axis } {
  const clamp = (n: number): Axis => (n > 0 ? 1 : n < 0 ? -1 : 0);
  return { dx: clamp(sx + sy), dz: clamp(sx - sy) };
}
