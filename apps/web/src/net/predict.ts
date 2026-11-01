import {
  SNAP_DISTANCE,
  TICK_DT,
  WALK_SPEED,
  spawnPlayer,
  stepPlayer,
  type StepInput,
} from "@office/shared";

/**
 * Client-side prediction and reconciliation (ARCHITECTURE.md 12.1).
 *
 * The local avatar runs the same `stepPlayer` at the same `TICK_DT` as the server and
 * renders between ticks. Every sent input carries a `seq`; the predictor keeps a ring
 * buffer of the predicted position per seq and reconciles on each snapshot without
 * replaying inputs: the error is the server position minus the predicted position at the
 * snapshot's `lastSeq`. Below `SNAP_DISTANCE` it is added to the current prediction over
 * about 100 ms; above it the avatar snaps to the server position.
 *
 * While an activity runs, the server drives the avatar (`advanceActivity`), so the client
 * draws from snapshots instead of predicting (`followSnapshot`).
 */

export const CORRECTION_MS = 100;
const BUFFER_KEEP = 180; // seqs; 9 s at 20 Hz

export interface ServerFix {
  x: number;
  z: number;
  facing: number;
  lastSeq: number;
}

export type ReconcileOutcome = "none" | "smooth" | "snap";

export class Predictor {
  readonly sim = spawnPlayer({ x: 0, z: 0 });
  seq = 0;
  private readonly buffer = new Map<number, { x: number; z: number }>();
  private readonly correction = { x: 0, z: 0 };
  private initialised = false;

  constructor(spawn: { x: number; z: number }, facing = 0) {
    this.sim.x = spawn.x;
    this.sim.z = spawn.z;
    this.sim.facing = facing;
  }

  /** The seq the next sent input carries. */
  nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }

  /**
   * Run one fixed step. `seq` is given for a sent input (recorded in the ring buffer)
   * and null for a silent continuation (route following with nothing to send).
   */
  tick(input: StepInput | null, seq: number | null = null, dt: number = TICK_DT): void {
    stepPlayer(this.sim, input, dt);
    if (seq !== null) {
      this.buffer.set(seq, { x: this.sim.x, z: this.sim.z });
      while (this.buffer.size > BUFFER_KEEP) {
        const oldest = this.buffer.keys().next();
        if (oldest.done) break;
        this.buffer.delete(oldest.value);
      }
    }
  }

  /**
   * Fold one server snapshot in. Only call this when the snapshot is newer than the last
   * one reconciled (the caller tracks `lastSeq` and the position): reconciling the same
   * snapshot twice would add its error twice.
   */
  reconcile(fix: ServerFix): ReconcileOutcome {
    if (!this.initialised) {
      this.reset(fix.x, fix.z, fix.facing);
      return "snap";
    }
    const pred = this.buffer.get(fix.lastSeq);
    if (!pred) return "none"; // stale, untracked, or rejected seq
    const ex = fix.x - pred.x;
    const ez = fix.z - pred.z;
    if (Math.hypot(ex, ez) >= SNAP_DISTANCE) {
      this.sim.x = fix.x;
      this.sim.z = fix.z;
      this.sim.facing = fix.facing;
      this.correction.x = 0;
      this.correction.z = 0;
      return "snap";
    }
    this.correction.x += ex;
    this.correction.z += ez;
    return "smooth";
  }

  /** Decay the pending correction over about `CORRECTION_MS`. Call every frame. */
  decay(dt: number): void {
    if (dt <= 0) return;
    const k = Math.max(0, 1 - dt / (CORRECTION_MS / 1000));
    this.correction.x *= k;
    this.correction.z *= k;
    if (Math.hypot(this.correction.x, this.correction.z) < 1e-4) {
      this.correction.x = 0;
      this.correction.z = 0;
    }
  }

  /** Where to draw the avatar: the prediction plus the undecayed correction. */
  pos(): { x: number; z: number } {
    return { x: this.sim.x + this.correction.x, z: this.sim.z + this.correction.z };
  }

  /** The pending correction, for tests. */
  pending(): { x: number; z: number } {
    return { ...this.correction };
  }

  /** Forget everything and stand on the snapshot (mode changes, join, reconnect). */
  reset(x: number, z: number, facing: number): void {
    this.sim.x = x;
    this.sim.z = z;
    this.sim.facing = facing;
    this.sim.pose = "stand";
    this.sim.speed = 0;
    this.sim.route = [];
    this.buffer.clear();
    this.correction.x = 0;
    this.correction.z = 0;
    this.initialised = true;
  }

  /** How far the sim walks in one tick at full speed, for tests. */
  static get walkSpeed(): number {
    return WALK_SPEED;
  }
}

export interface FollowState {
  x: number;
  z: number;
  facing: number;
}

/**
 * Draw the server-driven avatar (during an activity) from snapshots: jumps above
 * `SNAP_DISTANCE` snap, smaller gaps ease over, facing takes the short way round.
 * Returns true when it snapped.
 */
export function followSnapshot(
  current: FollowState,
  target: { x: number; z: number; facing: number },
  dt: number,
): boolean {
  if (Math.hypot(target.x - current.x, target.z - current.z) > SNAP_DISTANCE) {
    current.x = target.x;
    current.z = target.z;
    current.facing = target.facing;
    return true;
  }
  const k = dt > 0 ? 1 - Math.exp(-12 * dt) : 1;
  current.x += (target.x - current.x) * k;
  current.z += (target.z - current.z) * k;
  const delta = Math.atan2(
    Math.sin(target.facing - current.facing),
    Math.cos(target.facing - current.facing),
  );
  current.facing += delta * k;
  return false;
}
