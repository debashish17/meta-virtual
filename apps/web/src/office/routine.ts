import { OFFICE_WALK, type LayoutPart, type Point, type WalkMap } from '@office/shared'
import type { Pose } from './Person'

/**
 * Colleagues' days: typing at their desk for a while, then up and out along the office's paths to
 * the tea point (a drink at the counter, then a chat at one of the standing spots) or to the windows
 * for a phone call, and back to sit down again. Spots are reserved while someone is on their way or
 * there, so two people never stand in one place. Pure state, advanced by time, so it can be tested;
 * Colleagues.tsx draws it. Scenery only: in M3 real people come from the server.
 */

export type Spot = { id: string; x: number; z: number; facing: number; pose: 'interact' | 'talk' | 'phone' }
export type Seat = { x: number; z: number; facing: number; pose: 'type' | 'sit_talk'; aisle: Point }

type Hold = { kind: 'hold'; pose: Pose; seconds: number; facing: number; release?: string }
type Walk = { kind: 'walk'; path: Point[]; to?: string; i?: number }
type Step = Hold | Walk

export type Routine = {
  x: number; z: number; facing: number
  pose: Pose; speed: number
  seat: Seat
  spot: string | null          // the spot this person holds (on the way there or standing on it)
  steps: Step[]
  current: Step | null
  left: number                  // seconds left in the current hold
}

export type RoutineWorld = {
  walk: WalkMap
  spots: readonly Spot[]
  taken: Set<string>
  clips: { sit_down: number; stand_up: number; interact: number }   // seconds of the one-shot moves
  rand: () => number
}

const SPEED = 1.3            // m/s, an unhurried office walk
const TURN = 7               // how quickly people turn to face where they are going (1/s)
const BEHIND_CHAIR = 0.85    // metres behind the seat to the aisle
const facingOf = (dx: number, dz: number) => Math.atan2(dx, dz)

// The tea point (counter of the kitchenette, standing spots by the high table and the lounge chairs)
// and the window lounge; radians, 0 = facing +z (south). Each is moved onto open floor if needed.
const RAW: Spot[] = [
  { id: 'counter_1', x: 47.4, z: 1.35, facing: Math.PI, pose: 'interact' },
  { id: 'counter_2', x: 48.6, z: 1.35, facing: Math.PI, pose: 'interact' },
  { id: 'fridge', x: 50.4, z: 1.45, facing: Math.PI, pose: 'interact' },
  { id: 'chat_1', x: 48.4, z: 5.7, facing: Math.PI / 2, pose: 'talk' },
  { id: 'chat_2', x: 49.5, z: 5.7, facing: -Math.PI / 2, pose: 'talk' },
  { id: 'chat_3', x: 52.0, z: 5.4, facing: Math.PI / 2, pose: 'talk' },
  { id: 'chat_4', x: 53.1, z: 5.4, facing: -Math.PI / 2, pose: 'talk' },
  { id: 'window_1', x: 60.4, z: 13.4, facing: Math.PI / 2, pose: 'phone' },
  { id: 'window_2', x: 57.6, z: 8.4, facing: Math.PI / 2, pose: 'phone' },
]
export const OFFICE_SPOTS: readonly Spot[] = RAW.map((s) =>
  OFFICE_WALK.isWalkable(s.x, s.z) ? s : { ...s, ...(OFFICE_WALK.nearestWalkable(s, 1.2) ?? s) })

/** A desk chair as a seat: where the person sits, which way they face (the chair's front, towards
 * the desk) and the open floor behind the chair they step out to. */
export function seatFor(chair: LayoutPart, pose: Seat['pose'], walk: WalkMap): Seat {
  const facing = (chair.rotY * Math.PI) / 180
  const back = { x: chair.x - Math.sin(facing) * BEHIND_CHAIR, z: chair.z - Math.cos(facing) * BEHIND_CHAIR }
  const aisle = walk.isWalkable(back.x, back.z) ? back : walk.nearestWalkable(back, 0.6) ?? walk.nearestWalkable(back, 1.5) ?? back
  return { x: chair.x, z: chair.z, facing, pose, aisle }
}

/** Someone at their desk, getting up for the first time after `firstTripIn` seconds. */
export function routineAtDesk(seat: Seat, firstTripIn: number): Routine {
  return {
    x: seat.x, z: seat.z, facing: seat.facing, pose: seat.pose, speed: 0, seat, spot: null,
    steps: [{ kind: 'hold', pose: seat.pose, seconds: firstTripIn, facing: seat.facing }], current: null, left: 0,
  }
}

/** Someone already out at `spot`, heading back to their desk after `seconds`. */
export function routineAway(seat: Seat, spot: Spot, seconds: number, w: RoutineWorld): Routine {
  w.taken.add(spot.id)
  const path = w.walk.findPath(spot, seat.aisle)
  const r: Routine = {
    x: spot.x, z: spot.z, facing: spot.facing, pose: spot.pose, speed: 0, seat, spot: spot.id,
    steps: [{ kind: 'hold', pose: spot.pose, seconds, facing: spot.facing, release: spot.id }], current: null, left: 0,
  }
  r.steps.push(...backToDesk(seat, path.length ? path : [spot, seat.aisle], w))
  return r
}

/** The way back: along open floor to the aisle, into the chair, sit down, work. `path` is the route
 * from `from` to the aisle (planned before leaving the desk, so it is known to exist). */
function backToDesk(seat: Seat, path: Point[], w: RoutineWorld): Step[] {
  return [
    { kind: 'walk', path },
    { kind: 'walk', path: [seat.aisle, { x: seat.x, z: seat.z }] },
    { kind: 'hold', pose: 'sit_down', seconds: w.clips.sit_down, facing: seat.facing },
    { kind: 'hold', pose: seat.pose, seconds: 40 + w.rand() * 60, facing: seat.facing },
  ]
}

const free = (w: RoutineWorld, pose: Spot['pose']) => {
  const open = w.spots.filter((s) => s.pose === pose && !w.taken.has(s.id))
  return open.length ? open[Math.floor(w.rand() * open.length)] : null
}

/** Plan the next outing from the desk; if nowhere is free (or reachable), stay a little longer. */
function planOuting(r: Routine, w: RoutineWorld): Step[] {
  const seat = r.seat
  const stay: Step[] = [{ kind: 'hold', pose: seat.pose, seconds: 10 + w.rand() * 15, facing: seat.facing }]
  const leave: Step[] = [
    { kind: 'hold', pose: 'stand_up', seconds: w.clips.stand_up, facing: seat.facing },
    { kind: 'walk', path: [{ x: seat.x, z: seat.z }, seat.aisle] },
  ]
  if (w.rand() < 0.25) {
    const call = free(w, 'phone')
    const path = call && w.walk.findPath(seat.aisle, call)
    const back = call && w.walk.findPath(call, seat.aisle)
    if (!call || !path?.length || !back?.length) return stay
    w.taken.add(call.id)
    return [...leave,
      { kind: 'walk', path, to: call.id },
      { kind: 'hold', pose: 'phone', seconds: 15 + w.rand() * 15, facing: call.facing, release: call.id },
      ...backToDesk(seat, back, w)]
  }
  const counter = free(w, 'interact'), chat = free(w, 'talk')
  const there = counter && w.walk.findPath(seat.aisle, counter)
  const across = counter && chat && w.walk.findPath(counter, chat)
  const back = chat && w.walk.findPath(chat, seat.aisle)
  if (!counter || !chat || !there?.length || !across?.length || !back?.length) return stay
  w.taken.add(counter.id)
  w.taken.add(chat.id)
  return [...leave,
    { kind: 'walk', path: there, to: counter.id },
    { kind: 'hold', pose: 'interact', seconds: w.clips.interact, facing: counter.facing },
    { kind: 'hold', pose: 'stand', seconds: 1.5 + w.rand() * 2, facing: counter.facing, release: counter.id },
    { kind: 'walk', path: across, to: chat.id },
    { kind: 'hold', pose: 'talk', seconds: 12 + w.rand() * 18, facing: chat.facing, release: chat.id },
    ...backToDesk(seat, back, w)]
}

function turnTowards(r: Routine, target: number, dt: number) {
  const d = Math.atan2(Math.sin(target - r.facing), Math.cos(target - r.facing))
  r.facing += d * Math.min(1, dt * TURN)
}

function finish(r: Routine, s: Step, w: RoutineWorld) {
  if (s.kind === 'hold' && s.release) {
    w.taken.delete(s.release)
    if (r.spot === s.release) r.spot = null
  }
  r.current = null
}

/** Move the routine on by `dt` seconds. */
export function advance(r: Routine, dt: number, w: RoutineWorld) {
  let remaining = dt
  for (let guard = 0; remaining > 1e-9 && guard < 64; guard++) {
    if (!r.current) {
      if (!r.steps.length) r.steps.push(...planOuting(r, w))
      const next = r.steps.shift()!
      r.current = next
      if (next.kind === 'hold') r.left = next.seconds
      else {
        next.i = 0
        if (next.to) r.spot = next.to
      }
    }
    const s = r.current
    if (s.kind === 'hold') {
      r.pose = s.pose
      r.speed = 0
      const used = Math.min(remaining, r.left)
      turnTowards(r, s.facing, used)
      r.left -= used
      remaining -= used
      if (r.left <= 1e-9) finish(r, s, w)
      continue
    }
    r.pose = 'walk'
    r.speed = SPEED
    const target = s.path[s.i!]
    if (!target) { finish(r, s, w); continue }
    const dx = target.x - r.x, dz = target.z - r.z
    const dist = Math.hypot(dx, dz)
    if (dist < 1e-6) { s.i!++; continue }
    const step = Math.min(dist, remaining * SPEED)
    r.x += (dx / dist) * step
    r.z += (dz / dist) * step
    turnTowards(r, facingOf(dx, dz), step / SPEED)
    remaining -= step / SPEED
    if (step >= dist - 1e-9) s.i!++
  }
}
