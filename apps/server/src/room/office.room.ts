import { Client, Room } from "@colyseus/core";
import {
  ActivityStart,
  ActivityStop,
  AuthClaims,
  CHAT_HISTORY_MAX,
  CHAT_RATE_MAX,
  CHAT_RATE_WINDOW_S,
  CLIENT_MESSAGE,
  COUNTERS,
  ChatSend,
  DESK_SEATS,
  JoinOptions,
  LookSet,
  MOVE_RATE_PER_SECOND,
  MoveIntent,
  MoveTarget,
  OFFICE_WALK,
  PROTOCOL_VERSION,
  RECONNECT_SECONDS,
  SERVER_MESSAGE,
  StatusSet,
  TICK_DT,
  TICK_HZ,
  WORLD,
  advanceActivity,
  approachOf,
  riseOf,
  secondsOf,
  startActivity,
  stepPlayer,
  zoneAt,
  type Activity,
  type AuthClaims as AuthClaimsType,
  type AvatarLook,
  type ErrorCode,
  type Moves,
  type Point,
  type StepInput,
  type Target,
} from "@office/shared";
import { DevAuth, UnauthorizedError, type AuthVerifier } from "../auth/verify.js";
import { InMemoryChatStore } from "./chat.js";
import { registerRoom, unregisterRoom } from "./rooms.js";
import { OfficeState, PlayerState } from "./schema.js";

/**
 * The office room (ARCHITECTURE.md 12.1, 12.2): one per workspace, server-authoritative
 * movement at a fixed 20 Hz tick.
 *
 * - Auth: `static onAuth` verifies the SDK's `client.auth.token` through an `AuthVerifier`
 *   (wiring sets `OfficeRoom.verifier`; until P3-B wires the Supabase verifier it defaults
 *   to `DevAuth`, which refuses production). `onJoin` validates `JoinOptions`, checks the
 *   protocol, and refuses a `workspaceId` that is not the token's.
 * - Movement: `move_intent` (held keys, retained and re-applied each tick until replaced)
 *   and `move_target` (server-routed with `findPath`; unwalkable targets are rejected).
 *   Every step runs the shared `stepPlayer`, so the client predicts the same moves. `seq`
 *   counts the client's ticks; `lastSeq` is the seq of the last input the tick applied.
 * - Activities: `activity_start` reserves a known, free desk seat or counter spot, walks
 *   the player to its approach point with the shared sim, then runs the shared
 *   `advanceActivity`. The synced `activity` appears on arrival, not while walking over.
 *   A movement message or `activity_stop` ends it by standing up first; leaving releases
 *   the reservation. One reservation set per room; P3-A adds the colleagues to it.
 * - Limits: every message is parsed (invalid ones get `invalid_message` and are ignored),
 *   movement messages are capped at 30/s and chat at 5 per 10 s per connection, and no
 *   message can set a position.
 * - Reconnect: `allowReconnection(RECONNECT_SECONDS)`; the player and their reservation
 *   survive the window.
 *
 * Needs from wiring (server.ts, owned by P1-C): `.filterBy(["workspaceId"])` on the
 * `define("office", ...)` line so matchmaking makes one room per workspace.
 */

type HeldInput = { input: StepInput; seq: number };

type SessionRecord = {
  userId: string;
  name: string;
  /** Remaining waypoints of a `move_target` or an activity approach; the sim owns it. */
  route: Point[];
  /** Held keys, re-applied every tick until a new input replaces them. */
  intent: { dx: number; dz: number; run: boolean } | null;
  /** Movement received since the last tick; a queued `activity_stop` is `stopRequested`. */
  fresh: HeldInput | null;
  /** Movement received mid-activity, applied once the player is free again. */
  queued: HeldInput | null;
  stopRequested: boolean;
  /** Reserved target being walked to; the synced `activity` appears on arrival. */
  pendingTarget: Target | null;
  activity: Activity;
  heldTargetId: string | null;
  /** One-shot move lengths and the sit/stand step, at this player's height. */
  moves: Moves;
  moveHits: number[];
  chatHits: number[];
};

function movesFor(look: AvatarLook): Moves {
  return {
    sit_down: secondsOf("sit_down"),
    stand_up: secondsOf("stand_up"),
    interact: secondsOf("interact"),
    rise: riseOf(look),
  };
}

function targetById(targetId: string): Target | null {
  const seat = DESK_SEATS.find((s) => s.id === targetId);
  if (seat) return { kind: "seat", id: seat.id, seat };
  const spot = COUNTERS.find((s) => s.id === targetId);
  if (spot) return { kind: "counter", id: spot.id, spot };
  return null;
}

/** Sliding window: true when the hit fits, false when the bucket is full. */
function hit(bucket: number[], now: number, windowMs: number, max: number): boolean {
  while (bucket.length > 0 && bucket[0] <= now - windowMs) bucket.shift();
  if (bucket.length >= max) return false;
  bucket.push(now);
  return true;
}

export class OfficeRoom extends Room<{ state: OfficeState }> {
  /**
   * The token verifier. Wiring (and P3-B's Supabase verifier) assigns it; tests may too.
   * Until then `onAuth` falls back to `DevAuth`, which refuses production, and refuses
   * everything when `AUTH_MODE=supabase` without a wired verifier (fail closed).
   */
  static verifier: AuthVerifier | null = null;

  private chat = new InMemoryChatStore();
  private readonly recs = new Map<string, SessionRecord>();
  /** Seat and counter-spot ids held in this room, players (and later colleagues) alike. */
  private readonly taken = new Set<string>();
  private workspaceId: string | null = null;
  private chatSeq = 0;

  /** Reservation ids held in this room. Test seam. */
  get reservations(): ReadonlySet<string> {
    return this.taken;
  }

  static override async onAuth(token: string, options: unknown): Promise<AuthClaimsType> {
    void options;
    try {
      const verifier = OfficeRoom.verifier ?? defaultVerifier();
      return AuthClaims.parse(await verifier.verify(token));
    } catch (err) {
      const message = err instanceof Error ? err.message : "bad token";
      throw new UnauthorizedError(
        message.startsWith("unauthorized") ? message : `unauthorized: ${message}`,
      );
    }
  }

  override onCreate(): void {
    this.setState(new OfficeState());
    this.chat = new InMemoryChatStore();
    this.setPatchRate(Math.floor(1000 / TICK_HZ));
    this.setSimulationInterval(() => this.tick(), Math.floor(1000 / TICK_HZ));
    this.onMessage(CLIENT_MESSAGE.moveIntent, (client, message) =>
      this.onMoveIntent(client, message),
    );
    this.onMessage(CLIENT_MESSAGE.moveTarget, (client, message) =>
      this.onMoveTarget(client, message),
    );
    this.onMessage(CLIENT_MESSAGE.activityStart, (client, message) =>
      this.onActivityStart(client, message),
    );
    this.onMessage(CLIENT_MESSAGE.activityStop, (client, message) =>
      this.onActivityStop(client, message),
    );
    this.onMessage(CLIENT_MESSAGE.chatSend, (client, message) => this.onChatSend(client, message));
    this.onMessage(CLIENT_MESSAGE.statusSet, (client, message) =>
      this.onStatusSet(client, message),
    );
    this.onMessage(CLIENT_MESSAGE.lookSet, (client, message) => this.onLookSet(client, message));
  }

  override onJoin(client: Client, options: unknown): void {
    const claims = AuthClaims.safeParse(client.auth);
    if (!claims.success) {
      throw new UnauthorizedError("unauthorized: missing auth");
    }
    const parsed = JoinOptions.safeParse(options);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(",");
      throw new Error(`invalid_message: bad join options (${fields || "unknown"})`);
    }
    if (parsed.data.protocol !== PROTOCOL_VERSION) {
      throw new Error(`protocol_mismatch: expected ${PROTOCOL_VERSION}`);
    }
    if (parsed.data.workspaceId !== claims.data.workspaceId) {
      throw new Error("unauthorized: workspace mismatch");
    }
    if (this.workspaceId === null) {
      this.workspaceId = parsed.data.workspaceId;
      registerRoom(this.workspaceId, this);
    } else if (this.workspaceId !== parsed.data.workspaceId) {
      throw new Error("unauthorized: workspace mismatch");
    }
    const at = this.freeSpawn();
    const player = new PlayerState();
    player.id = client.sessionId;
    player.userId = claims.data.userId;
    player.name = claims.data.name;
    Object.assign(player.look, parsed.data.look);
    player.x = at.x;
    player.z = at.z;
    player.facing = 0;
    player.pose = "stand";
    player.speed = 0;
    player.activity.kind = "";
    player.activity.targetId = "";
    player.status = "available";
    player.zoneId = zoneAt(at.x, at.z)?.id ?? "";
    player.lastSeq = 0;
    this.state.players.set(client.sessionId, player);
    this.recs.set(client.sessionId, {
      userId: claims.data.userId,
      name: claims.data.name,
      route: [],
      intent: null,
      fresh: null,
      queued: null,
      stopRequested: false,
      pendingTarget: null,
      activity: { kind: "free" },
      heldTargetId: null,
      moves: movesFor(parsed.data.look),
      moveHits: [],
      chatHits: [],
    });
    client.send(SERVER_MESSAGE.chatHistory, { messages: this.chat.recent(CHAT_HISTORY_MAX) });
  }

  override async onDrop(client: Client): Promise<void> {
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS);
    } catch {
      // The window expired; `onLeave` removes the player.
    }
  }

  override onLeave(client: Client): void {
    this.removePlayer(client.sessionId);
  }

  override onDispose(): void {
    unregisterRoom(this.workspaceId, this);
  }

  // Messages. Every payload is parsed; anything invalid gets `invalid_message` and is
  // ignored. Movement messages share one 30/s bucket per connection.

  private onMoveIntent(client: Client, message: unknown): void {
    const rec = this.recs.get(client.sessionId);
    if (!rec) return;
    const parsed = MoveIntent.safeParse(message);
    if (!parsed.success) {
      this.fail(client, "invalid_message", "bad move_intent");
      return;
    }
    if (!this.checkMoveRate(client, rec)) return;
    this.cancelApproach(rec);
    rec.fresh = {
      input: { kind: "intent", dx: parsed.data.dx, dz: parsed.data.dz, run: parsed.data.run },
      seq: parsed.data.seq,
    };
  }

  private onMoveTarget(client: Client, message: unknown): void {
    const rec = this.recs.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!rec || !player) return;
    const parsed = MoveTarget.safeParse(message);
    if (!parsed.success) {
      this.fail(client, "invalid_message", "bad move_target");
      return;
    }
    if (!this.checkMoveRate(client, rec)) return;
    if (!OFFICE_WALK.isWalkable(parsed.data.x, parsed.data.z)) {
      this.fail(client, "unwalkable", "target is not walkable");
      return;
    }
    const route = OFFICE_WALK.findPath(
      { x: player.x, z: player.z },
      { x: parsed.data.x, z: parsed.data.z },
    );
    if (route.length === 0) {
      this.fail(client, "unwalkable", "target cannot be reached");
      return;
    }
    this.cancelApproach(rec);
    rec.fresh = {
      input: { kind: "target", x: parsed.data.x, z: parsed.data.z },
      seq: parsed.data.seq,
    };
  }

  private onActivityStart(client: Client, message: unknown): void {
    const rec = this.recs.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!rec || !player) return;
    const parsed = ActivityStart.safeParse(message);
    if (!parsed.success) {
      this.fail(client, "invalid_message", "bad activity_start");
      return;
    }
    if (!this.checkMoveRate(client, rec)) return;
    const target = targetById(parsed.data.targetId);
    if (!target) {
      this.fail(client, "invalid_message", "unknown activity target");
      return;
    }
    if (this.taken.has(target.id)) {
      this.fail(client, "target_taken", "target is taken");
      return;
    }
    this.endActivity(rec, player);
    const route = OFFICE_WALK.findPath({ x: player.x, z: player.z }, approachOf(target));
    if (route.length === 0) {
      this.fail(client, "unwalkable", "target cannot be reached");
      return;
    }
    this.taken.add(target.id);
    rec.heldTargetId = target.id;
    rec.route = route;
    rec.intent = null;
    rec.fresh = null;
    rec.queued = null;
    rec.stopRequested = false;
    rec.pendingTarget = target;
    player.lastSeq = parsed.data.seq;
  }

  private onActivityStop(client: Client, message: unknown): void {
    const rec = this.recs.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!rec || !player) return;
    const parsed = ActivityStop.safeParse(message);
    if (!parsed.success) {
      this.fail(client, "invalid_message", "bad activity_stop");
      return;
    }
    player.lastSeq = parsed.data.seq;
    if (rec.pendingTarget) {
      this.cancelApproach(rec);
    } else if (rec.activity.kind !== "free") {
      rec.stopRequested = true;
    }
  }

  private onChatSend(client: Client, message: unknown): void {
    const rec = this.recs.get(client.sessionId);
    if (!rec) return;
    const parsed = ChatSend.safeParse(message);
    if (!parsed.success) {
      this.fail(client, "invalid_message", "bad chat_send");
      return;
    }
    if (!hit(rec.chatHits, Date.now(), CHAT_RATE_WINDOW_S * 1000, CHAT_RATE_MAX)) {
      this.fail(client, "rate_limited", "too many chat messages");
      return;
    }
    this.chatSeq += 1;
    const chat = {
      id: `${client.sessionId}:${this.chatSeq}`,
      userId: rec.userId,
      name: rec.name,
      text: parsed.data.text,
      ts: Date.now(),
    };
    this.chat.add(chat);
    this.broadcast(SERVER_MESSAGE.chat, chat);
  }

  private onStatusSet(client: Client, message: unknown): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const parsed = StatusSet.safeParse(message);
    if (!parsed.success) {
      this.fail(client, "invalid_message", "bad status_set");
      return;
    }
    player.status = parsed.data.status;
  }

  private onLookSet(client: Client, message: unknown): void {
    const rec = this.recs.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!rec || !player) return;
    const parsed = LookSet.safeParse(message);
    if (!parsed.success) {
      this.fail(client, "invalid_message", "bad look_set");
      return;
    }
    Object.assign(player.look, parsed.data.look);
    rec.moves = movesFor(parsed.data.look);
  }

  // The fixed tick. Input handlers only stash; this is the one place that moves players.

  private tick(): void {
    for (const [sessionId, player] of this.state.players.entries()) {
      const rec = this.recs.get(sessionId);
      if (!rec) continue;
      try {
        if (rec.pendingTarget || rec.activity.kind !== "free") {
          this.tickActivity(player, rec);
        } else {
          this.tickMovement(player, rec);
        }
        this.checkZone(player, rec);
      } catch (err) {
        // One bad player must not stop the room; the message carries no secrets.
        console.warn(`[room] tick failed for ${sessionId}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  private tickMovement(player: PlayerState, rec: SessionRecord): void {
    const sim = {
      x: player.x,
      z: player.z,
      facing: player.facing,
      pose: toSimPose(player.pose),
      speed: player.speed,
      route: rec.route,
    };
    const fresh = rec.fresh;
    rec.fresh = null;
    if (fresh) {
      stepPlayer(sim, fresh.input, TICK_DT);
      player.lastSeq = fresh.seq;
      rec.intent =
        fresh.input.kind === "intent"
          ? { dx: fresh.input.dx, dz: fresh.input.dz, run: fresh.input.run }
          : null;
    } else if (rec.intent) {
      stepPlayer(sim, { kind: "intent", ...rec.intent }, TICK_DT);
    } else {
      stepPlayer(sim, null, TICK_DT);
    }
    player.x = sim.x;
    player.z = sim.z;
    player.facing = sim.facing;
    player.pose = sim.pose;
    player.speed = sim.speed;
    rec.route = sim.route;
  }

  private tickActivity(player: PlayerState, rec: SessionRecord): void {
    const pending = rec.pendingTarget;
    if (pending) {
      // Walk the approach with the shared sim; the activity starts on arrival.
      const sim = {
        x: player.x,
        z: player.z,
        facing: player.facing,
        pose: toSimPose(player.pose),
        speed: player.speed,
        route: rec.route,
      };
      stepPlayer(sim, null, TICK_DT);
      player.x = sim.x;
      player.z = sim.z;
      player.facing = sim.facing;
      player.pose = sim.pose;
      player.speed = sim.speed;
      rec.route = sim.route;
      if (rec.route.length === 0) {
        rec.pendingTarget = null;
        rec.activity = startActivity(pending);
        player.activity.kind = pending.kind;
        player.activity.targetId = pending.id;
      }
      return;
    }
    if (rec.fresh) {
      // Movement mid-activity stands the player up first; the input applies once free.
      rec.queued = rec.fresh;
      rec.fresh = null;
    }
    const body = { x: player.x, z: player.z, facing: player.facing };
    const res = advanceActivity(
      rec.activity,
      body,
      TICK_DT,
      rec.queued !== null || rec.stopRequested,
      rec.moves,
    );
    player.x = body.x;
    player.z = body.z;
    player.facing = body.facing;
    player.pose = res.pose ?? "stand";
    player.speed = res.speed;
    rec.activity = res.activity;
    if (res.activity.kind === "free") {
      this.release(rec);
      player.activity.kind = "";
      player.activity.targetId = "";
      rec.stopRequested = false;
      // The stashed movement applies on the next tick, now that the player is free.
      rec.fresh = rec.queued;
      rec.queued = null;
    }
  }

  private checkZone(player: PlayerState, rec: SessionRecord): void {
    const next = zoneAt(player.x, player.z)?.id ?? "";
    if (next === player.zoneId) return;
    const prev = player.zoneId;
    player.zoneId = next;
    if (prev !== "") {
      this.broadcast(SERVER_MESSAGE.zoneEvent, { userId: rec.userId, zoneId: prev, kind: "leave" });
    }
    if (next !== "") {
      this.broadcast(SERVER_MESSAGE.zoneEvent, { userId: rec.userId, zoneId: next, kind: "enter" });
    }
  }

  private fail(client: Client, code: ErrorCode, message: string): void {
    client.send(SERVER_MESSAGE.error, { code, message });
  }

  private checkMoveRate(client: Client, rec: SessionRecord): boolean {
    if (hit(rec.moveHits, Date.now(), 1000, MOVE_RATE_PER_SECOND)) return true;
    this.fail(client, "rate_limited", "too many movement messages");
    return false;
  }

  /** Walkable spawn, or the nearest walkable point no other player stands on. */
  private freeSpawn(): Point {
    const spawn = { x: WORLD.spawn.x, z: WORLD.spawn.z };
    const occupied = (p: Point): boolean => {
      for (const player of this.state.players.values()) {
        if (Math.hypot(player.x - p.x, player.z - p.z) < 0.6) return true;
      }
      return false;
    };
    if (OFFICE_WALK.isWalkable(spawn.x, spawn.z) && !occupied(spawn)) return spawn;
    for (let ring = 1; ring <= 10; ring += 1) {
      const r = ring * 0.5;
      const steps = ring * 8;
      for (let k = 0; k < steps; k += 1) {
        const a = (k / steps) * Math.PI * 2;
        const p = { x: spawn.x + Math.cos(a) * r, z: spawn.z + Math.sin(a) * r };
        if (OFFICE_WALK.isWalkable(p.x, p.z) && !occupied(p)) return p;
      }
    }
    return OFFICE_WALK.nearestWalkable(spawn, 6) ?? spawn;
  }

  /** Stop walking to a reserved target and free it (a movement message cancels the trip). */
  private cancelApproach(rec: SessionRecord): void {
    if (rec.pendingTarget) {
      rec.pendingTarget = null;
      rec.route = [];
      this.release(rec);
    }
  }

  /**
   * End any current activity at once, freeing its reservation. Only a new `activity_start`
   * replaces an activity this way; movement and `activity_stop` stand up through the tick.
   */
  private endActivity(rec: SessionRecord, player: PlayerState): void {
    this.cancelApproach(rec);
    if (rec.activity.kind !== "free") {
      rec.activity = { kind: "free" };
      player.activity.kind = "";
      player.activity.targetId = "";
      player.pose = "stand";
      player.speed = 0;
    }
    this.release(rec);
  }

  private release(rec: SessionRecord): void {
    if (rec.heldTargetId !== null) {
      this.taken.delete(rec.heldTargetId);
      rec.heldTargetId = null;
    }
  }

  private removePlayer(sessionId: string): void {
    const rec = this.recs.get(sessionId);
    if (rec) {
      this.release(rec);
      this.recs.delete(sessionId);
    }
    this.state.players.delete(sessionId);
  }
}

/** Plain movement only ever stands, walks or jogs; anything else starts from standing. */
function toSimPose(pose: string): "stand" | "walk" | "jog" {
  return pose === "walk" || pose === "jog" ? pose : "stand";
}

function defaultVerifier(): AuthVerifier {
  if (process.env.AUTH_MODE === "supabase") {
    throw new UnauthorizedError("unauthorized: auth not configured");
  }
  return new DevAuth();
}
