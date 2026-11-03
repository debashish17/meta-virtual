import { TICK_DT } from "../net/index.js";
import { OFFICE_WALK, WalkMap, type Point } from "../world/index.js";
import { keepApart } from "./apart.js";

export * from "./apart.js";

/**
 * The one movement function the server (authority) and the client (prediction) both run, at fixed
 * `TICK_DT` steps (ARCHITECTURE.md 12.1). It is deterministic: the same player and inputs always
 * give the same result, so prediction and authority agree and reconciliation stays invisible.
 *
 * While an activity (desk seat, counter) runs, the activity code moves the player instead
 * (`advanceActivity` in `people/activity.ts`): the server does not call this for them.
 */

export const WALK_SPEED = 2.3; // m/s; jogging uses WalkMap.MAX_SPEED
const WAYPOINT_REACH = 0.06; // m; within this a route waypoint counts as reached

/** Poses plain movement can set; activities set the rest. */
export type SimPose = "stand" | "walk" | "jog";

export type SimPlayer = {
  x: number;
  z: number;
  facing: number; // radians, 0 = +z
  pose: SimPose;
  speed: number; // m/s, measured over the last step
  route: Point[]; // remaining waypoints of a `move_target`, [] when none
};

/** A fresh player standing at a spawn point. */
export function spawnPlayer(at: Point, facing = 0): SimPlayer {
  return { x: at.x, z: at.z, facing, pose: "stand", speed: 0, route: [] };
}

/** The latest input for a player: held keys, a floor click, an explicit stop, or nothing new. */
export type StepInput =
  | { kind: "intent"; dx: number; dz: number; run: boolean }
  | { kind: "target"; x: number; z: number }
  | { kind: "stop" };

/**
 * Move a player by one fixed step. A new intent replaces any route; a new target plans one with
 * `findPath` (an unwalkable or unreachable target leaves the player standing: the server rejects
 * such moves before calling this); with no input the player keeps following their route, if any.
 * Movement goes through `WalkMap.step`, so walls, glass and furniture are never crossed, and the
 * speed never exceeds the walk or jog maximum.
 */
export function stepPlayer(
  p: SimPlayer,
  input: StepInput | null,
  dt: number = TICK_DT,
  walk: WalkMap = OFFICE_WALK,
  /** Other people, kept `PERSON_GAP` away (keepApart); the player itself is not among them. */
  others: readonly Point[] = [],
): void {
  if (input?.kind === "stop") {
    p.route = [];
    p.pose = "stand";
    p.speed = 0;
    return;
  }
  if (input?.kind === "intent") {
    p.route = [];
    // clamped: the socket schema only allows -1 | 0 | 1, but the sim does not trust its caller
    const dx = Math.max(-1, Math.min(1, input.dx));
    const dz = Math.max(-1, Math.min(1, input.dz));
    if (dx === 0 && dz === 0) {
      p.pose = "stand";
      p.speed = 0;
      return;
    }
    const len = Math.hypot(dx, dz);
    moveBy(p, { x: dx / len, z: dz / len }, dt, input.run ? WalkMap.MAX_SPEED : WALK_SPEED, walk, others);
    if (p.speed < 0.15) {
      p.pose = "stand"; // pressed into a wall: not moving
    } else {
      p.pose = input.run ? "jog" : "walk";
    }
    return;
  }
  if (input?.kind === "target") {
    p.route = walk.findPath(p, input);
    if (!p.route.length) {
      p.pose = "stand";
      p.speed = 0;
    }
  }
  if (!p.route.length) {
    if (!input) {
      p.pose = "stand";
      p.speed = 0;
    }
    return;
  }
  while (p.route.length > 0 && Math.hypot(p.route[0].x - p.x, p.route[0].z - p.z) < WAYPOINT_REACH) {
    p.route.shift(); // reached: aim at the next waypoint this same step
  }
  if (!p.route.length) {
    p.pose = "stand";
    p.speed = 0;
    return;
  }
  const toWaypoint = Math.hypot(p.route[0].x - p.x, p.route[0].z - p.z);
  const dir = { x: (p.route[0].x - p.x) / toWaypoint, z: (p.route[0].z - p.z) / toWaypoint };
  moveBy(p, dir, Math.min(dt, toWaypoint / WALK_SPEED), WALK_SPEED, walk, others); // stop on the waypoint
  p.pose = p.speed < 0.15 ? "stand" : "walk";
}

function moveBy(p: SimPlayer, dir: Point, dt: number, speed: number, walk: WalkMap, others: readonly Point[]) {
  const before = { x: p.x, z: p.z };
  const next = keepApart(before, walk.step(before, dir, dt, speed), others, walk);
  const moved = Math.hypot(next.x - before.x, next.z - before.z);
  p.x = next.x;
  p.z = next.z;
  if (moved > 1e-9) p.facing = Math.atan2(next.x - before.x, next.z - before.z);
  p.speed = dt > 0 ? moved / dt : 0;
}
