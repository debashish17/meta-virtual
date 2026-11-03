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
 * renders between ticks (`draw`). Every sent input carries a `seq`; the predictor keeps a
 * ring buffer of the predicted position per seq and reconciles on each snapshot without
 * replaying inputs: the error is the server position minus the predicted position at the
 * snapshot's `lastSeq`. The error moves the prediction at once, together with every
 * prediction still in flight (so a later snapshot does not report it again). Below
 * `SNAP_DISTANCE` the drawn avatar eases onto it over about 100 ms; above it the drawn
 * avatar jumps with it.
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
  /** Where the sim stood before its latest tick: `draw` interpolates from here. */
  private readonly prev = { x: 0, z: 0 };
  /** Drawn minus predicted position: a correction not shown yet, eased out by `decay`. */
  private readonly offset = { x: 0, z: 0 };
  private initialised = false;

  constructor(spawn: { x: number; z: number }, facing = 0) {
    this.sim.x = spawn.x;
    this.sim.z = spawn.z;
    this.sim.facing = facing;
    this.prev.x = spawn.x;
    this.prev.z = spawn.z;
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
    this.prev.x = this.sim.x;
    this.prev.z = this.sim.z;
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
   * Fold one server snapshot in. Call it when the snapshot is newer than the last one
   * reconciled (the caller tracks `lastSeq`); folding the same snapshot again finds no
   * error, because the prediction at `lastSeq` moved with the first fold.
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
    // The server's word moves the prediction now, and every prediction from `lastSeq` on:
    // the inputs still in flight were predicted from the same wrong place.
    this.sim.x += ex;
    this.sim.z += ez;
    this.prev.x += ex;
    this.prev.z += ez;
    for (const [seq, p] of this.buffer) {
      if (seq >= fix.lastSeq) {
        p.x += ex;
        p.z += ez;
      }
    }
    if (Math.hypot(ex, ez) >= SNAP_DISTANCE) {
      this.sim.facing = fix.facing;
      this.offset.x = 0;
      this.offset.z = 0;
      return "snap";
    }
    // Small: keep drawing where the avatar was and ease onto the new prediction.
    this.offset.x -= ex;
    this.offset.z -= ez;
    return "smooth";
  }

  /** Ease the drawn avatar onto the prediction over about `CORRECTION_MS`. Call every frame. */
  decay(dt: number): void {
    if (dt <= 0) return;
    const k = Math.max(0, 1 - dt / (CORRECTION_MS / 1000));
    this.offset.x *= k;
    this.offset.z *= k;
    if (Math.hypot(this.offset.x, this.offset.z) < 1e-4) {
      this.offset.x = 0;
      this.offset.z = 0;
    }
  }

  /** The corrected prediction: where the server's word puts the avatar after its latest tick. */
  pos(): { x: number; z: number } {
    return { x: this.sim.x, z: this.sim.z };
  }

  /**
   * Where to draw the avatar: `alpha` (0..1, the time since the latest tick over `TICK_DT`)
   * of the way from the previous tick to the latest, plus the correction still easing out.
   * Drawing only at the ticks moved the avatar 20 times a second while the camera and the
   * walk cycle move every frame.
   */
  draw(alpha = 1): { x: number; z: number } {
    const a = Math.min(1, Math.max(0, alpha));
    return {
      x: this.prev.x + (this.sim.x - this.prev.x) * a + this.offset.x,
      z: this.prev.z + (this.sim.z - this.prev.z) * a + this.offset.z,
    };
  }

  /** The correction not drawn yet (prediction minus drawn position), for tests. */
  pending(): { x: number; z: number } {
    return { x: 0 - this.offset.x, z: 0 - this.offset.z };
  }

  /** Forget everything and stand on the snapshot (mode changes, join, reconnect). */
  reset(x: number, z: number, facing: number): void {
    this.sim.x = x;
    this.sim.z = z;
    this.sim.facing = facing;
    this.sim.pose = "stand";
    this.sim.speed = 0;
    this.sim.route = [];
    this.prev.x = x;
    this.prev.z = z;
    this.buffer.clear();
    this.offset.x = 0;
    this.offset.z = 0;
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
