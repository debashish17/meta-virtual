import { FURNITURE, OFFICE_WALK, zoneAt, type Point } from "../world/index.js";
import type { Pose } from "./pose.js";
import { OFFICE_SPOTS, besideOf, roundTheChair, seatFor, type Seat, type Spot } from "./routine.js";
import { FREE_SEATS, seatKey } from "./seats.js";

export { seatKey };

/**
 * What someone can do besides walking: sit at a free desk chair and type, take a lounge,
 * café or meeting-room seat for a chat (seats.ts), or make a drink at the tea counter.
 * Clicking a chair or the counter (or pressing E beside one) walks them to it; moving
 * off stands them up again. People sit down as the colleagues do (routine.ts): round beside the
 * chair, back onto it, swivel to the desk; and stand up the same way in reverse. Seats and counter
 * spots are reserved in a set passed in by the caller (one per server room; the web keeps its own
 * for offline mode), so nobody takes a place someone else holds. Pure state, advanced by time, so
 * it can be tested.
 */

/** Every desk chair in the team areas, as a seat. */
export const DESK_SEATS: readonly (Seat & { id: string })[] = FURNITURE
  .filter((p) => p.part === 'seating.task-chair-black' && zoneAt(p.x, p.z)?.id.startsWith('team_'))
  .map((c) => ({ ...seatFor(c, 'type', OFFICE_WALK), id: seatKey(c) }))

/** Every seat anyone can sit on: the desk seats plus the free seating (seats.ts). */
export const ALL_SEATS: readonly (Seat & { id: string })[] = [...DESK_SEATS, ...FREE_SEATS]
export const COUNTERS: readonly Spot[] = OFFICE_SPOTS.filter((s) => s.pose === 'interact')

export type Target = { kind: 'seat'; id: string; seat: Seat } | { kind: 'counter'; id: string; spot: Spot }
export type Body = { x: number; z: number; facing: number }

const REACH = { seat: 0.8, counter: 1.4 }   // how far from a chair or counter spot a click still means it
const STEP_SPEED = 1.0                       // m/s stepping round the chair
const TURN = 8
const SWIVEL = 0.8                           // seconds turning in the chair between the desk and the side
const STEADY = 0.4                           // ... standing still after getting up

/** The free chair, lounge seat or counter a floor point (a click, or where you stand) is meant for, if any. */
export function targetNear(p: Point, taken: ReadonlySet<string>, scale = 1): Target | null {
  const d = (q: Point) => Math.hypot(q.x - p.x, q.z - p.z)
  const seat = ALL_SEATS.filter((s) => !taken.has(s.id) && d(s) < REACH.seat * scale).sort((a, b) => d(a) - d(b))[0]
  if (seat) return { kind: 'seat', id: seat.id, seat }
  const spot = COUNTERS.filter((s) => !taken.has(s.id) && d(s) < REACH.counter * scale).sort((a, b) => d(a) - d(b))[0]
  return spot ? { kind: 'counter', id: spot.id, spot } : null
}

/** Where you walk to before the activity starts: behind the chair, or onto the counter spot. */
export const approachOf = (t: Target): Point => (t.kind === 'seat' ? t.seat.aisle : { x: t.spot.x, z: t.spot.z })

type SeatTarget = Extract<Target, { kind: 'seat' }>
export type Activity =
  | { kind: 'free' }
  | { kind: 'entering'; target: SeatTarget; i: number }      // round beside the chair (path point i), then back to it
  | { kind: 'sitting_down'; target: SeatTarget; left: number }
  | { kind: 'swivelling'; target: SeatTarget; left: number; to: 'desk' | 'side' }
  | { kind: 'seated'; target: SeatTarget }
  | { kind: 'standing_up'; target: SeatTarget; left: number }
  | { kind: 'leaving'; target: SeatTarget; i: number; wait: number }
  | { kind: 'using'; target: Extract<Target, { kind: 'counter' }>; left: number; done: number }

/** Seconds of the one-shot moves, and metres from the seat to where you stand to sit down (the
 * moves' stand-to-seat distance at your height). */
export type Moves = { sit_down: number; stand_up: number; interact: number; rise: number }

/** Begin at the approach point. */
export const startActivity = (t: Target): Activity =>
  t.kind === 'seat' ? { kind: 'entering', target: t, i: 0 } : { kind: 'using', target: t, left: -1, done: 0 }

const off = (me: Body, to: number) => Math.atan2(Math.sin(to - me.facing), Math.cos(to - me.facing))
function turn(me: Body, to: number, dt: number) {
  me.facing += off(me, to) * Math.min(1, dt * TURN)
}

/** Move `me` towards `to`; true once there. */
function stepTo(me: Body, to: Point, dt: number) {
  const dx = to.x - me.x, dz = to.z - me.z, dist = Math.hypot(dx, dz)
  if (dist < 1e-6) return true
  const step = Math.min(dist, dt * STEP_SPEED)
  me.x += (dx / dist) * step
  me.z += (dz / dist) * step
  turn(me, Math.atan2(dx, dz), dt)
  return step >= dist - 1e-9
}

/**
 * Advance an activity by `dt`. `wantsToMove` is true while a movement key is pressed or another
 * destination was asked for: it stands the person up (or ends the drink). Returns the next
 * activity and the pose to show (null once free, when ordinary walking takes over); the caller
 * frees its reservation set on 'free'.
 */
export function advanceActivity(a: Activity, me: Body, dt: number, wantsToMove: boolean,
  moves: Moves): { activity: Activity; pose: Pose | null; speed: number } {
  if (a.kind === 'free') return { activity: a, pose: null, speed: 0 }
  if (a.kind === 'using') return useCounter(a, me, dt, wantsToMove, moves)
  const seat = a.target.seat, away = Math.atan2(seat.side.x, seat.side.z)
  switch (a.kind) {
    case 'entering': {
      const path = roundTheChair(seat, moves.rise)
      if (a.i < path.length) return { activity: stepTo(me, path[a.i], dt) ? { ...a, i: a.i + 1 } : a, pose: 'walk', speed: STEP_SPEED }
      turn(me, away, dt)                                          // your back to the chair
      if (Math.abs(off(me, away)) > 0.03) return { activity: a, pose: 'stand', speed: 0 }
      me.x = seat.x                                               // the move carries you from beside the chair onto it
      me.z = seat.z
      return { activity: { kind: 'sitting_down', target: a.target, left: moves.sit_down }, pose: 'sit_down', speed: 0 }
    }
    case 'sitting_down': {
      turn(me, away, dt)
      const left = a.left - dt
      return left > 0 ? { activity: { ...a, left }, pose: 'sit_down', speed: 0 }
        : { activity: { kind: 'swivelling', target: a.target, left: SWIVEL, to: 'desk' }, pose: 'seated', speed: 0 }
    }
    case 'swivelling': {
      turn(me, a.to === 'desk' ? seat.facing : away, dt)
      const left = a.left - dt
      if (left > 0) return { activity: { ...a, left }, pose: 'seated', speed: 0 }
      return a.to === 'desk' ? { activity: { kind: 'seated', target: a.target }, pose: seat.pose, speed: 0 }
        : { activity: { kind: 'standing_up', target: a.target, left: moves.stand_up }, pose: 'stand_up', speed: 0 }
    }
    case 'seated':
      turn(me, seat.facing, dt)
      if (wantsToMove) return { activity: { kind: 'swivelling', target: a.target, left: SWIVEL, to: 'side' }, pose: 'seated', speed: 0 }
      return { activity: a, pose: seat.pose, speed: 0 }
    case 'standing_up': {
      const left = a.left - dt
      if (left > 0) return { activity: { ...a, left }, pose: 'stand_up', speed: 0 }
      const beside = besideOf(seat, moves.rise)                   // where the move has carried you
      me.x = beside.x
      me.z = beside.z
      return { activity: { kind: 'leaving', target: a.target, i: 1, wait: STEADY }, pose: 'stand', speed: 0 }
    }
    case 'leaving': {
      if (a.wait > 0) return { activity: { ...a, wait: a.wait - dt }, pose: 'stand', speed: 0 }
      const path = roundTheChair(seat, moves.rise).reverse()
      if (a.i >= path.length) return { activity: { kind: 'free' }, pose: 'walk', speed: STEP_SPEED }
      return { activity: stepTo(me, path[a.i], dt) ? { ...a, i: a.i + 1 } : a, pose: 'walk', speed: STEP_SPEED }
    }
  }
}

function useCounter(a: Extract<Activity, { kind: 'using' }>, me: Body, dt: number, wantsToMove: boolean,
  moves: Moves): { activity: Activity; pose: Pose | null; speed: number } {
  if (wantsToMove) return { activity: { kind: 'free' }, pose: null, speed: 0 }
  const left = a.left < 0 ? moves.interact : a.left - dt
  turn(me, a.target.spot.facing, dt)
  if (left > 0) return { activity: { ...a, left }, pose: 'interact', speed: 0 }
  const done = a.done + dt                                   // a moment with the drink before moving on
  return done < 1.2 ? { activity: { ...a, left: 0, done }, pose: 'stand', speed: 0 } : { activity: { kind: 'free' }, pose: 'stand', speed: 0 }
}
