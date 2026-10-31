import { FURNITURE, OFFICE_WALK, zoneAt, type Point } from '@office/shared'
import type { Pose } from './Person'
import { OFFICE_SPOTS, seatFor, type Seat, type Spot } from './routine'

/**
 * What you can do besides walking: sit at a free desk chair and type, or make a drink at the tea
 * counter. Clicking a chair or the counter (or pressing E beside one) walks you to it; moving off
 * stands you up again. Seats and counter spots are reserved in one set shared with the colleagues,
 * so nobody takes a place someone else holds. Pure state, advanced by time, so it can be tested;
 * Avatar.tsx drives it.
 */

/** Seats (`seat:x,z`) and spots (their id) that someone holds, colleagues and you alike. */
export const TAKEN = new Set<string>()
export const seatKey = (p: Point) => `seat:${p.x.toFixed(2)},${p.z.toFixed(2)}`

/** Every desk chair in the team areas, as a seat. */
export const DESK_SEATS: readonly (Seat & { id: string })[] = FURNITURE
  .filter((p) => p.part === 'seating.task-chair-black' && zoneAt(p.x, p.z)?.id.startsWith('team_'))
  .map((c) => ({ ...seatFor(c, 'type', OFFICE_WALK), id: seatKey(c) }))
export const COUNTERS: readonly Spot[] = OFFICE_SPOTS.filter((s) => s.pose === 'interact')

export type Target = { kind: 'seat'; id: string; seat: Seat } | { kind: 'counter'; id: string; spot: Spot }
export type Body = { x: number; z: number; facing: number }

const REACH = { seat: 0.8, counter: 1.4 }   // how far from a chair or counter spot a click still means it
const STEP_SPEED = 1.0                       // m/s stepping into or out of the chair
const TURN = 8

/** The free chair or counter a floor point (a click, or where you stand) is meant for, if any. */
export function targetNear(p: Point, taken: ReadonlySet<string>, scale = 1): Target | null {
  const d = (q: Point) => Math.hypot(q.x - p.x, q.z - p.z)
  const seat = DESK_SEATS.filter((s) => !taken.has(s.id) && d(s) < REACH.seat * scale).sort((a, b) => d(a) - d(b))[0]
  if (seat) return { kind: 'seat', id: seat.id, seat }
  const spot = COUNTERS.filter((s) => !taken.has(s.id) && d(s) < REACH.counter * scale).sort((a, b) => d(a) - d(b))[0]
  return spot ? { kind: 'counter', id: spot.id, spot } : null
}

/** Where you walk to before the activity starts: behind the chair, or onto the counter spot. */
export const approachOf = (t: Target): Point => (t.kind === 'seat' ? t.seat.aisle : { x: t.spot.x, z: t.spot.z })

export type Activity =
  | { kind: 'free' }
  | { kind: 'entering'; target: Extract<Target, { kind: 'seat' }> }
  | { kind: 'sitting_down'; target: Extract<Target, { kind: 'seat' }>; left: number }
  | { kind: 'seated'; target: Extract<Target, { kind: 'seat' }> }
  | { kind: 'standing_up'; target: Extract<Target, { kind: 'seat' }>; left: number }
  | { kind: 'leaving'; target: Extract<Target, { kind: 'seat' }> }
  | { kind: 'using'; target: Extract<Target, { kind: 'counter' }>; left: number; done: number }

/** Begin at the approach point. */
export const startActivity = (t: Target): Activity =>
  t.kind === 'seat' ? { kind: 'entering', target: t } : { kind: 'using', target: t, left: -1, done: 0 }

function turn(me: Body, to: number, dt: number) {
  const d = Math.atan2(Math.sin(to - me.facing), Math.cos(to - me.facing))
  me.facing += d * Math.min(1, dt * TURN)
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
 * Advance an activity by `dt`. `wantsToMove` is true while you press a movement key or have asked to
 * go somewhere else: it stands you up (or ends the drink). Returns the next activity and the pose
 * to show (null once free, when ordinary walking takes over); the caller frees `TAKEN` on 'free'.
 */
export function advanceActivity(a: Activity, me: Body, dt: number, wantsToMove: boolean,
  seconds: { blend: number; interact: number }): { activity: Activity; pose: Pose | null; speed: number } {
  switch (a.kind) {
    case 'free':
      return { activity: a, pose: null, speed: 0 }
    case 'entering': {
      const there = stepTo(me, a.target.seat, dt)
      if (!there) return { activity: a, pose: 'walk', speed: STEP_SPEED }
      return { activity: { kind: 'sitting_down', target: a.target, left: seconds.blend }, pose: 'walk', speed: STEP_SPEED }
    }
    case 'sitting_down': {
      turn(me, a.target.seat.facing, dt)
      const left = a.left - dt
      return left > 0 ? { activity: { ...a, left }, pose: 'sit_down', speed: 0 } : { activity: { kind: 'seated', target: a.target }, pose: 'type', speed: 0 }
    }
    case 'seated':
      turn(me, a.target.seat.facing, dt)
      if (wantsToMove) return { activity: { kind: 'standing_up', target: a.target, left: seconds.blend }, pose: 'stand_up', speed: 0 }
      return { activity: a, pose: 'type', speed: 0 }
    case 'standing_up': {
      const left = a.left - dt
      return left > 0 ? { activity: { ...a, left }, pose: 'stand_up', speed: 0 } : { activity: { kind: 'leaving', target: a.target }, pose: 'walk', speed: STEP_SPEED }
    }
    case 'leaving': {
      const there = stepTo(me, a.target.seat.aisle, dt)
      return there ? { activity: { kind: 'free' }, pose: 'walk', speed: STEP_SPEED } : { activity: a, pose: 'walk', speed: STEP_SPEED }
    }
    case 'using': {
      if (wantsToMove) return { activity: { kind: 'free' }, pose: null, speed: 0 }
      const left = a.left < 0 ? seconds.interact : a.left - dt
      turn(me, a.target.spot.facing, dt)
      if (left > 0) return { activity: { ...a, left }, pose: 'interact', speed: 0 }
      const done = a.done + dt                                   // a moment with the drink before moving on
      return done < 1.2 ? { activity: { ...a, left: 0, done }, pose: 'stand', speed: 0 } : { activity: { kind: 'free' }, pose: 'stand', speed: 0 }
    }
  }
}
