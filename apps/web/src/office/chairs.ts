/**
 * Desk chairs swivel with whoever sits in them. Sitting down, a person backs onto the chair from
 * its side and then swivels to the desk (routine.ts, activity.ts), and standing up the other way
 * round; the chair used to stay facing the desk throughout. Now it turns to the person as they
 * sit, follows them round to the desk and back, and turns back to its desk a moment after they
 * leave.
 */

/** People in a chair this frame, reported by `Person` (any person: you, others, colleagues). */
export const sitting = new Map<object, { x: number; z: number; facing: number }>();

const ON = 0.35;          // metres: someone this near a chair's middle is sitting in it
const FOLLOW = 18;        // 1/s: how closely a chair keeps up with its sitter
const LEAVE = 1.0;        // seconds a vacated chair stays as it was left
const RETURN = 3;         // 1/s: how quickly it then turns back to its desk

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The turn of each chair of one kind, `angles` in radians about +y like the placements' `rotY`. */
export class Swivel {
  readonly angles: Float32Array;
  private readonly rest: Float32Array;
  private readonly vacant: Float32Array;

  constructor(private readonly chairs: readonly { x: number; z: number; rotY: number }[]) {
    this.rest = Float32Array.from(chairs, (c) => (c.rotY * Math.PI) / 180);
    this.angles = Float32Array.from(this.rest);
    this.vacant = new Float32Array(chairs.length).fill(LEAVE);
  }

  /** Move the chairs on by `dt` seconds; true when any of them turned. */
  update(dt: number, sitters: Iterable<{ x: number; z: number; facing: number }>): boolean {
    if (dt <= 0) return false;
    const occupant = new Map<number, number>(); // chair index -> facing
    for (const s of sitters) {
      let best = -1;
      let bestD = ON * ON;
      this.chairs.forEach((c, i) => {
        const d = (c.x - s.x) ** 2 + (c.z - s.z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best >= 0) occupant.set(best, s.facing);
    }
    let moved = false;
    for (let i = 0; i < this.chairs.length; i += 1) {
      const facing = occupant.get(i);
      let target: number;
      let rate: number;
      if (facing !== undefined) {
        this.vacant[i] = 0;
        target = facing;
        rate = FOLLOW;
      } else {
        this.vacant[i] += dt;
        target = this.rest[i];
        rate = this.vacant[i] > LEAVE ? RETURN : 0;
      }
      const delta = wrap(target - this.angles[i]);
      if (rate === 0 || Math.abs(delta) < 1e-4) {
        if (rate !== 0 && delta !== 0) {
          this.angles[i] = target;
          moved = true;
        }
        continue;
      }
      this.angles[i] = wrap(this.angles[i] + delta * (1 - Math.exp(-rate * dt)));
      moved = true;
    }
    return moved;
  }
}
