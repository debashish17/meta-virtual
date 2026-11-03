import { OFFICE_WALK, type Point, type WalkMap } from "../world/index.js";

/**
 * People keep out of each other's way (ARCHITECTURE.md 12.1). The walk map only knows walls,
 * glass and furniture, so on their own people walked straight through each other.
 */

/** The closest two people's centres come, in metres (two shoulder-wide discs). */
export const PERSON_GAP = 0.5;
/** A move cut to less than this share of itself by someone in the way counts as blocked. */
const BLOCKED = 0.4;
/** Of a blocked move, how much is stepped to the mover's right instead. */
const SIDESTEP = 0.7;

/**
 * Keep a move clear of other people. `to` is where a step from `from` would end, already cleared
 * of walls (`WalkMap.step`). The part of the move that would bring the mover nearer than
 * `PERSON_GAP` to anyone is dropped, so people slide past each other instead of through. When
 * that blocks the move (someone right in the way), the mover sidesteps to its right: someone
 * standing still is walked round, and two people meeting head on both keep right and pass.
 * Moving away from someone already too close is always allowed, so an overlap (a spawn, a
 * teleport) never traps anyone. The result is walkable whenever `from` is.
 */
export function keepApart(
  from: Point,
  to: Point,
  others: readonly Point[],
  walk: WalkMap = OFFICE_WALK,
): Point {
  const mx = to.x - from.x;
  const mz = to.z - from.z;
  const len = Math.hypot(mx, mz);
  if (others.length === 0 || len < 1e-9) return to;
  const kept = clear(from, mx, mz, others);
  if (Math.hypot(kept.x, kept.z) >= len * BLOCKED) return landing(from, kept, walk);
  // Blocked: step to the right of the way we wanted to go, then clear that too.
  const side = clear(from, kept.x + (mz / len) * len * SIDESTEP, kept.z - (mx / len) * len * SIDESTEP, others);
  const around = landing(from, side, walk);
  return around.x !== from.x || around.z !== from.z ? around : landing(from, kept, walk);
}

/** The move `(vx, vz)` from `from`, with its part towards anyone it would bring too close dropped. */
function clear(from: Point, vx: number, vz: number, others: readonly Point[]): Point {
  for (let pass = 0; pass < 2; pass += 1) {
    for (const o of others) {
      const ex = from.x + vx - o.x;
      const ez = from.z + vz - o.z;
      if (ex * ex + ez * ez >= PERSON_GAP * PERSON_GAP) continue;
      const nx0 = from.x - o.x;
      const nz0 = from.z - o.z;
      const d = Math.hypot(nx0, nz0);
      if (d < 1e-9) continue; // exactly on top of each other: any way out is fine
      const nx = nx0 / d;
      const nz = nz0 / d;
      const vn = vx * nx + vz * nz; // negative: towards o
      const allowed = -Math.max(0, d - PERSON_GAP); // how far towards o is still fine
      if (vn < allowed) {
        vx += (allowed - vn) * nx;
        vz += (allowed - vn) * nz;
      }
    }
  }
  return { x: vx, z: vz };
}

/** Where the move `v` from `from` lands, or `from` itself if that is not walkable. */
function landing(from: Point, v: Point, walk: WalkMap): Point {
  const x = from.x + v.x;
  const z = from.z + v.z;
  return walk.isWalkable(x, z) ? { x, z } : { ...from };
}

/** Poses of someone in a chair (sitting down, seated, typing, standing up): the chair is where
 * they are, and neighbours at a desk sit nearer than PERSON_GAP to someone stepping in beside it. */
const IN_A_CHAIR: ReadonlySet<string> = new Set(["sit_down", "seated", "type", "sit_talk", "stand_up"]);

/** Whether someone in this pose is in other people's way (everyone not in a chair). */
export function inTheWay(pose: string): boolean {
  return !IN_A_CHAIR.has(pose);
}
