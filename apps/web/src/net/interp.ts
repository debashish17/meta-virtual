import {
  INTERP_DELAY_MS,
  SNAP_DISTANCE,
  TICK_HZ,
  type AvatarLook,
  type NpcView,
  type PlayerView,
  type Pose,
  type Status,
} from "@office/shared";

/**
 * Remote-player snapshots (P2-B): mapping the wire state to views, and the
 * interpolation buffer every remote person is drawn from.
 *
 * The server's Colyseus schema cannot hold a null child or a nullable primitive
 * (`apps/server/src/room/schema.ts`), so an empty `activity.kind` means no activity
 * and an empty `zoneId` means no zone. The mappers below turn both back into null.
 */

/** The decoded fields the client reads off the schema instances. */
export interface RawLook {
  body: string;
  top: string;
  accent: string;
  bottom: string;
  shoes: string;
  height: number;
}

export interface RawActivity {
  kind: string;
  targetId: string;
}

export interface RawPlayerState {
  id: string;
  userId: string;
  name: string;
  look: RawLook;
  x: number;
  z: number;
  facing: number;
  pose: string;
  speed: number;
  activity: RawActivity;
  status: string;
  zoneId: string;
  lastSeq: number;
}

export interface RawNpcState {
  id: string;
  name: string;
  look: RawLook;
  x: number;
  z: number;
  facing: number;
  pose: string;
  speed: number;
}

function toLook(raw: RawLook): AvatarLook {
  // The server only ever stores looks it validated against AvatarLook on the way in.
  return {
    body: raw.body as AvatarLook["body"],
    top: raw.top as AvatarLook["top"],
    accent: raw.accent as AvatarLook["accent"],
    bottom: raw.bottom as AvatarLook["bottom"],
    shoes: raw.shoes as AvatarLook["shoes"],
    height: raw.height,
  };
}

export function toPlayerView(raw: RawPlayerState): PlayerView {
  return {
    id: raw.id,
    userId: raw.userId,
    name: raw.name,
    look: toLook(raw.look),
    x: raw.x,
    z: raw.z,
    facing: raw.facing,
    pose: raw.pose as Pose,
    speed: raw.speed,
    activity:
      raw.activity.kind === ""
        ? null
        : { kind: raw.activity.kind as "seat" | "counter", targetId: raw.activity.targetId },
    status: raw.status as Status,
    zoneId: raw.zoneId === "" ? null : raw.zoneId,
    lastSeq: raw.lastSeq,
  };
}

export function toNpcView(raw: RawNpcState): NpcView {
  return {
    id: raw.id,
    name: raw.name,
    look: toLook(raw.look),
    x: raw.x,
    z: raw.z,
    facing: raw.facing,
    pose: raw.pose as Pose,
    speed: raw.speed,
  };
}

/** One received snapshot of a remote person. `t` is `performance.now()` on receipt. */
export interface Snapshot {
  t: number;
  x: number;
  z: number;
  facing: number; // radians
  pose: Pose;
  speed: number; // m/s
}

/** What to draw this frame: an interpolated position and the pose stepping with it. */
export interface Sampled extends Snapshot {
  /** True when the draw position snapped (a jump, or the first snapshot). */
  snapped: boolean;
}

function lerpAngle(a: number, b: number, t: number): number {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

/**
 * The snapshot buffer one remote person is drawn from (ARCHITECTURE.md 12.1): samples
 * `INTERP_DELAY_MS` behind the latest snapshot, interpolating position and facing, with
 * pose and speed stepping with the snapshot. A position jump above `SNAP_DISTANCE`
 * between two snapshots (sitting down, standing up) snaps instead of sliding, so the cut
 * in `Person` lines up with the move.
 */
export class SnapshotBuffer {
  private snaps: Snapshot[] = [];

  push(snap: Snapshot): void {
    const snaps = this.snaps;
    const last = snaps[snaps.length - 1];
    if (last && snap.t < last.t) return; // out of order: keep the newer one
    snaps.push(snap);
    while (snaps.length > 2 && snaps[0].t < snap.t - 1000) snaps.shift();
    while (snaps.length > 60) snaps.shift();
  }

  /** The newest snapshot received, if any. */
  get latest(): Snapshot | null {
    return this.snaps.length > 0 ? this.snaps[this.snaps.length - 1] : null;
  }

  sample(now: number): Sampled | null {
    const snaps = this.snaps;
    if (snaps.length === 0) return null;
    const target = now - INTERP_DELAY_MS;
    if (snaps.length === 1 || target <= snaps[0].t) {
      return { ...snaps[0], snapped: true };
    }
    const last = snaps[snaps.length - 1];
    if (target >= last.t) {
      return { ...last, snapped: false };
    }
    let i = 0;
    while (i + 1 < snaps.length && snaps[i + 1].t <= target) i += 1;
    const from = snaps[i];
    const to = snaps[i + 1];
    if (Math.hypot(to.x - from.x, to.z - from.z) > SNAP_DISTANCE) {
      return { ...to, snapped: true };
    }
    const span = to.t - from.t;
    const t = span > 0 ? (target - from.t) / span : 1;
    return {
      t: target,
      x: from.x + (to.x - from.x) * t,
      z: from.z + (to.z - from.z) * t,
      facing: lerpAngle(from.facing, to.facing, t),
      pose: to.pose,
      speed: to.speed,
      snapped: false,
    };
  }
}

/**
 * Times remote snapshots for the buffer (ARCHITECTURE.md 12.1). The room sends one patch
 * per tick, but where its timer is coarse they arrive unevenly: on Windows after 62.5 or
 * 46.875 ms, 50 on average. Interpolating on raw arrival times then pulses the walking
 * speed, so each snapshot is stamped one tick after the previous stamp, drifting slowly
 * towards the real arrival times. After a gap (the person stood still) it starts again
 * from the arrival; a stamp is never earlier than the previous one, nor more than one tick
 * after its arrival.
 */
export class ArrivalPacer {
  private last: number | null = null;

  constructor(
    private readonly periodMs: number = 1000 / TICK_HZ,
    private readonly follow = 0.1,
  ) {}

  stamp(arrival: number): number {
    const last = this.last;
    let t: number;
    if (last === null || arrival - (last + this.periodMs) > this.periodMs) {
      t = arrival;
    } else {
      const expected = last + this.periodMs;
      t = Math.min(expected + (arrival - expected) * this.follow, arrival + this.periodMs);
      if (t < last) t = last;
    }
    this.last = t;
    return t;
  }
}
