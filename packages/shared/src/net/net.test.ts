import { describe, expect, it } from "vitest";
import { z } from "zod";
import type {
  Activity, Body, BodySpec, Moves, Pose, Routine, RoutineWorld, Seat, SimPlayer, SimPose,
  Spot, StepInput, Target,
} from "../index.js";
import { DEFAULT_LOOK } from "../people/look.js";

/** Type-level half of the re-export check: fails to compile if any type is not re-exported. */
export type _RootTypes = [
  Activity, Body, BodySpec, Moves, Pose, Routine, RoutineWorld, Seat, SimPlayer, SimPose, Spot,
  StepInput, Target,
];
import {
  ActivityStart,
  ActivityStop,
  AuthClaims,
  Axis,
  Caption,
  CaptionSend,
  ChatHistory,
  ChatMessage,
  ChatSend,
  HistoryRequest,
  TeleportAdmin,
  ErrorCode,
  GoTo,
  GoToPlace,
  JoinOptions,
  LookSet,
  MeetingInvite,
  MoveIntent,
  MoveTarget,
  NpcView,
  PlayerActivity,
  PlayerView,
  RecordKind,
  RecordsChanged,
  Seq,
  ServerError,
  Status,
  StatusSet,
  ZoneEvent,
  screenToIntent,
} from "./index.js";

const look = DEFAULT_LOOK;
const chat = { id: "c1", userId: "u-maya", name: "Maya", text: "hello", ts: 1730419200000 };
const player = {
  id: "p1", userId: "u-maya", name: "Maya", look,
  x: 30, z: 20, facing: 1.2, pose: "walk", speed: 2.3,
  activity: null, status: "available", zoneId: "team_a", lastSeq: 41,
} as const;

describe("socket contract", () => {
  it("accepts a join and claims, and trims the display name", () => {
    const join = { protocol: 1, displayName: "  Maya  ", workspaceId: "northwind-demo", look };
    expect(JoinOptions.parse(join).displayName).toBe("Maya");
    expect(AuthClaims.parse({ userId: "u1", name: "Maya", workspaceId: "w" })).toBeTruthy();
  });

  it("rejects bad joins and claims", () => {
    const join = { protocol: 1, displayName: "Maya", workspaceId: "w", look };
    expect(JoinOptions.safeParse({ ...join, displayName: "" }).success).toBe(false);
    expect(JoinOptions.safeParse({ ...join, displayName: "   " }).success).toBe(false);
    expect(JoinOptions.safeParse({ ...join, displayName: "x".repeat(41) }).success).toBe(false);
    expect(JoinOptions.safeParse({ ...join, protocol: "1" }).success).toBe(false);
    expect(JoinOptions.safeParse({ ...join, look: { ...look, body: "robot" } }).success).toBe(false);
    expect(AuthClaims.safeParse({ userId: "", name: "M", workspaceId: "w" }).success).toBe(false);
  });

  it("accepts every client message", () => {
    expect(MoveIntent.parse({ seq: 7, dx: -1, dz: 1, run: true })).toBeTruthy();
    expect(MoveTarget.parse({ seq: 8, x: 30.5, z: 20 })).toBeTruthy();
    expect(ActivityStart.safeParse({ seq: 9, targetId: "seat:12.00,3.00" }).success).toBe(true);
    expect(ActivityStart.safeParse({ seq: 9, targetId: "counter_1" }).success).toBe(true);
    expect(ActivityStop.safeParse({ seq: 10 }).success).toBe(true);
    expect(ChatSend.parse({ text: "  hello  " }).text).toBe("hello");
    expect(HistoryRequest.parse({})).toEqual({});
    expect(TeleportAdmin.parse({ x: 1, z: -2 })).toEqual({ x: 1, z: -2 });
    expect(CaptionSend.parse({ text: "  go live  ", final: false, ts: 1 }).text).toBe("go live");
    expect(StatusSet.parse({ status: "in_meeting" }).status).toBe("in_meeting");
    expect(StatusSet.parse({ status: "working" }).status).toBe("working");
    expect(StatusSet.parse({ status: "on_break" }).status).toBe("on_break");
    expect(GoToPlace.parse("break")).toBe("break");
    expect(GoTo.parse({ seq: 11, place: "desk" })).toEqual({ seq: 11, place: "desk" });
    expect(LookSet.parse({ look }).look).toEqual(look);
    expect(Seq.parse(0)).toBe(0);
    expect(Axis.parse(-1)).toBe(-1);
  });

  it("rejects bad client messages", () => {
    expect(MoveIntent.safeParse({ seq: 7, dx: 2, dz: 0, run: false }).success).toBe(false);
    expect(MoveIntent.safeParse({ seq: -1, dx: 0, dz: 0, run: false }).success).toBe(false);
    expect(MoveIntent.safeParse({ seq: 7, dx: 0, dz: 0 }).success).toBe(false);
    expect(MoveIntent.safeParse({ seq: 7, dx: 0, dz: 0, run: false, x: 1 }).success).toBe(false);
    expect(MoveTarget.safeParse({ seq: 8, x: Number.NaN, z: 20 }).success).toBe(false);
    expect(MoveTarget.safeParse({ seq: 8, x: 1, z: 2, y: 0 }).success).toBe(false);
    expect(ActivityStart.safeParse({ seq: 9, targetId: "" }).success).toBe(false);
    expect(ActivityStop.safeParse({}).success).toBe(false);
    expect(ChatSend.safeParse({ text: "" }).success).toBe(false);
    expect(ChatSend.safeParse({ text: "   " }).success).toBe(false);
    expect(ChatSend.safeParse({ text: "x".repeat(501) }).success).toBe(false);
    expect(HistoryRequest.safeParse({ since: 1 }).success).toBe(false);
    expect(TeleportAdmin.safeParse({ x: 1 }).success).toBe(false);
    expect(TeleportAdmin.safeParse({ x: 1, z: 2, yaw: 0 }).success).toBe(false);
    expect(CaptionSend.safeParse({ text: "", final: true, ts: 1 }).success).toBe(false);
    expect(CaptionSend.safeParse({ text: "x", final: "yes", ts: 1 }).success).toBe(false);
    expect(StatusSet.safeParse({ status: "busy" }).success).toBe(false);
    expect(GoTo.safeParse({ seq: 1, place: "sofa" }).success).toBe(false);
    expect(GoTo.safeParse({ seq: -1, place: "desk" }).success).toBe(false);
    expect(GoTo.safeParse({ place: "desk" }).success).toBe(false);
    expect(GoTo.safeParse({ seq: 1, place: "desk", run: true }).success).toBe(false);
    expect(Status.safeParse("available").success).toBe(true);
    expect(LookSet.safeParse({ look: { ...look, height: 3 } }).success).toBe(false);
  });

  it("accepts every server message", () => {
    expect(ChatMessage.parse(chat)).toBeTruthy();
    expect(ChatHistory.parse({ messages: [chat] }).messages).toHaveLength(1);
    expect(ChatHistory.parse({ messages: [] }).messages).toEqual([]);
    expect(Caption.parse({ name: "Maya", text: "go live", final: true, ts: 2 })).toBeTruthy();
    expect(ZoneEvent.parse({ userId: "u1", zoneId: "acme_room", kind: "enter" })).toBeTruthy();
    expect(RecordsChanged.parse({ kinds: ["tasks", "meetings"] }).kinds).toHaveLength(2);
    expect(RecordKind.parse("proposed_changes")).toBe("proposed_changes");
    expect(ServerError.parse({ code: "rate_limited", message: "slow down" }).code).toBe("rate_limited");
    expect(ErrorCode.parse("protocol_mismatch")).toBe("protocol_mismatch");
    expect(ErrorCode.parse("no_home_desk")).toBe("no_home_desk");
    expect(RecordKind.parse("bookings")).toBe("bookings");
    expect(RecordKind.parse("board")).toBe("board");
    const invite = {
      bookingId: "00000000-0000-4000-8000-000000000001",
      zoneId: "acme_room",
      title: "  Standup  ",
      hostName: "Maya",
    };
    expect(MeetingInvite.parse(invite).title).toBe("Standup");
    expect(MeetingInvite.parse({ ...invite, zoneId: null }).zoneId).toBeNull();
  });

  it("rejects bad server messages", () => {
    expect(ChatMessage.safeParse({ ...chat, text: "" }).success).toBe(false);
    expect(ChatMessage.safeParse({ ...chat, ts: -1 }).success).toBe(false);
    expect(ChatHistory.safeParse({ messages: Array.from({ length: 51 }, () => chat) }).success).toBe(false);
    expect(ZoneEvent.safeParse({ userId: "u1", zoneId: "z", kind: "stay" }).success).toBe(false);
    expect(RecordsChanged.safeParse({ kinds: ["widgets"] }).success).toBe(false);
    expect(ServerError.safeParse({ code: "boom", message: "x" }).success).toBe(false);
    expect(ServerError.safeParse({ code: "unwalkable", message: "" }).success).toBe(false);
    const badInvite = {
      bookingId: "00000000-0000-4000-8000-000000000001",
      zoneId: "acme_room",
      title: "Standup",
      hostName: "Maya",
    };
    expect(MeetingInvite.safeParse({ ...badInvite, bookingId: "nope" }).success).toBe(false);
    expect(MeetingInvite.safeParse({ ...badInvite, title: "" }).success).toBe(false);
    expect(MeetingInvite.safeParse({ ...badInvite, title: "x".repeat(121) }).success).toBe(false);
    expect(MeetingInvite.safeParse({ ...badInvite, hostName: "  " }).success).toBe(false);
    expect(MeetingInvite.safeParse({ ...badInvite, zoneId: "" }).success).toBe(false);
    expect(MeetingInvite.safeParse({ ...badInvite, agenda: "x" }).success).toBe(false);
  });

  it("accepts the synced state views", () => {
    expect(PlayerView.parse(player)).toBeTruthy();
    expect(PlayerView.parse({
      ...player, activity: { kind: "seat", targetId: "seat:1,2" }, zoneId: null,
    }).activity).toEqual({ kind: "seat", targetId: "seat:1,2" });
    expect(PlayerView.parse({ ...player, status: "working" }).status).toBe("working");
    expect(PlayerView.parse({ ...player, status: "on_break" }).status).toBe("on_break");
    const npc = {
      id: player.id, name: player.name, look: player.look, x: player.x,
      z: player.z, facing: player.facing, pose: player.pose, speed: player.speed,
    };
    expect(NpcView.parse(npc)).toBeTruthy();
    expect(PlayerActivity.parse({ kind: "counter", targetId: "counter_2" })).toBeTruthy();
  });

  it("rejects bad state views", () => {
    expect(PlayerView.safeParse({ ...player, pose: "dance" }).success).toBe(false);
    expect(PlayerView.safeParse({ ...player, speed: -1 }).success).toBe(false);
    expect(PlayerView.safeParse({ ...player, lastSeq: 1.5 }).success).toBe(false);
    expect(PlayerView.safeParse({ ...player, activity: { kind: "bed", targetId: "x" } }).success).toBe(false);
    const npc = {
      id: player.id, name: player.name, look: player.look, x: player.x,
      z: player.z, facing: player.facing, pose: player.pose, speed: player.speed,
    };
    expect(NpcView.safeParse({ ...npc, status: "available" }).success).toBe(false);
    expect(NpcView.safeParse({ ...npc, id: "" }).success).toBe(false);
  });

  it("rejects unknown fields on every object schema", () => {
    const cases: [z.ZodType, unknown][] = [
      [JoinOptions, { protocol: 1, displayName: "M", workspaceId: "w", look }],
      [AuthClaims, { userId: "u", name: "M", workspaceId: "w" }],
      [MoveIntent, { seq: 1, dx: 0, dz: 0, run: false }],
      [MoveTarget, { seq: 1, x: 1, z: 2 }],
      [ActivityStart, { seq: 1, targetId: "counter_1" }],
      [ActivityStop, { seq: 1 }],
      [ChatSend, { text: "hi" }],
      [StatusSet, { status: "away" }],
      [LookSet, { look }],
      [GoTo, { seq: 1, place: "desk" }],
      [ChatMessage, chat],
      [ChatHistory, { messages: [] }],
      [ZoneEvent, { userId: "u", zoneId: "z", kind: "leave" }],
      [RecordsChanged, { kinds: [] }],
      [MeetingInvite, {
        bookingId: "00000000-0000-4000-8000-000000000001",
        zoneId: null,
        title: "t",
        hostName: "h",
      }],
      [ServerError, { code: "unwalkable", message: "no" }],
      [PlayerActivity, { kind: "seat", targetId: "s" }],
      [PlayerView, player],
    ];
    for (const [schema, value] of cases) {
      expect(schema.safeParse(value).success).toBe(true);
      expect(schema.safeParse({ ...(value as object), smuggled: 1 }).success).toBe(false);
    }
  });

  it("is re-exported from the package root (no `export *` name is dropped)", async () => {
    const root = await import("../index.js") as Record<string, unknown>;
    for (const name of ["PROTOCOL_VERSION", "TICK_HZ", "TICK_DT", "INTERP_DELAY_MS", "SNAP_DISTANCE",
      "MOVE_RATE_PER_SECOND", "CHAT_RATE_MAX", "CHAT_RATE_WINDOW_S", "RECONNECT_SECONDS",
      "PROXIMITY_ENTER_M", "PROXIMITY_LEAVE_M", "DISPLAY_NAME_MIN", "DISPLAY_NAME_MAX",
      "CHAT_TEXT_MAX", "CHAT_HISTORY_MAX", "Seq", "Axis", "JoinOptions", "AuthClaims", "MoveIntent",
      "MoveTarget", "ActivityStart", "ActivityStop", "ChatSend", "CaptionSend", "HistoryRequest",
      "TeleportAdmin", "Status", "StatusSet", "LookSet", "GoTo", "GoToPlace", "MeetingInvite",
      "ChatMessage", "ChatHistory", "Caption", "ZoneEvent", "RecordKind", "RecordsChanged", "ErrorCode",
      "ServerError", "PlayerActivity", "PlayerView", "NpcView", "CLIENT_MESSAGE", "SERVER_MESSAGE",
      "screenToIntent", "WALK_SPEED", "spawnPlayer", "stepPlayer", "PoseSchema", "OFFICE_SPOTS",
      "seatFor", "besideOf", "roundTheChair", "routineAtDesk", "routineAway", "advance", "seatKey",
      "DESK_SEATS", "COUNTERS", "approachOf", "startActivity", "advanceActivity", "secondsOf",
      "riseOf"]) {
      expect(root[name], name).not.toBeUndefined();
    }
  });

  it("maps screen directions onto world axes", () => {
    expect(screenToIntent(0, 1)).toEqual({ dx: 1, dz: -1 }); // screen up
    expect(screenToIntent(1, 0)).toEqual({ dx: 1, dz: 1 }); // screen right
    expect(screenToIntent(0, -1)).toEqual({ dx: -1, dz: 1 }); // screen down
    expect(screenToIntent(-1, 0)).toEqual({ dx: -1, dz: -1 }); // screen left
    expect(screenToIntent(0, 0)).toEqual({ dx: 0, dz: 0 });
    expect(screenToIntent(1, 1)).toEqual({ dx: 1, dz: 0 }); // diagonals stay in range
    expect(screenToIntent(-1, 1)).toEqual({ dx: 0, dz: -1 });
  });
});
