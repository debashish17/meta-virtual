import { type LayoutPart } from "../layouts/index.js";
import { FURNITURE, OFFICE_WALK, type Point, type WalkMap } from "../world/index.js";
import type { Pose } from "./pose.js";

/**
 * Colleagues' days: typing at their desk for a while, then up and out along the office's paths to
 * the tea point (a drink at the counter, then a chat at one of the standing spots) or to the windows
 * for a phone call, and back to sit down again. As the Mixamo moves they play are made, people sit
 * down by stepping round beside the chair, backing onto it and swivelling to the desk, and stand up
 * the same way in reverse. Spots are reserved while someone is on their way or
 * there, so two people never stand in one place. Pure state, advanced by time, so it can be tested.
 * Shared: the web runs it for offline colleagues, the server for the synced ones (each room keeps
 * its own reservation set, passed in as `taken`).
 */

export type Spot = { id: string; x: number; z: number; facing: number; pose: 'interact' | 'talk' | 'phone' }
/** `side` is the unit direction from the seat to where one stands to sit down: across the chair, to
 * the side away from the next chair along the desk. */
export type Seat = { x: number; z: number; facing: number; pose: 'type' | 'sit_talk'; aisle: Point; side: Point }

/** `at` moves the person there as the hold starts: sitting down and standing up play with the
 * person placed on the seat, the moves carrying the body between it and the spot beside it. */
type Hold = { kind: 'hold'; pose: Pose; seconds: number; facing: number; release?: string; at?: Point }
type Walk = { kind: 'walk'; path: Point[]; to?: string; i?: number }
type Step = Hold | Walk

export type Routine = {
  x: number; z: number; facing: number
  pose: Pose; speed: number
  seat: Seat
  rise: number                 // metres from the seat to where they stand to sit down, at their height
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
const SWIVEL = 0.8           // seconds turning in the chair between the desk and the side
const SETTLE = 0.7           // ... turning your back to the chair before sitting down
const STEADY = 0.4           // ... standing still after getting up
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

const OTHER_SEATS = FURNITURE.filter((p) => p.part.startsWith('seating.'))

/** A desk chair as a seat: where the person sits, which way they face (the chair's front, towards
 * the desk), the open floor behind the chair they step out to, and the side they sit down from. */
export function seatFor(chair: LayoutPart, pose: Seat['pose'], walk: WalkMap): Seat {
  const facing = (chair.rotY * Math.PI) / 180
  const back = { x: chair.x - Math.sin(facing) * BEHIND_CHAIR, z: chair.z - Math.cos(facing) * BEHIND_CHAIR }
  const aisle = walk.isWalkable(back.x, back.z) ? back : walk.nearestWalkable(back, 0.6) ?? walk.nearestWalkable(back, 1.5) ?? back
  const room = (side: Point) => Math.min(...OTHER_SEATS.filter((p) => p.x !== chair.x || p.z !== chair.z)
    .map((p) => Math.hypot(p.x - (chair.x + side.x * 0.5), p.z - (chair.z + side.z * 0.5))))
  const right = { x: Math.cos(facing), z: -Math.sin(facing) }, left = { x: -right.x, z: -right.z }
  return { x: chair.x, z: chair.z, facing, pose, aisle, side: room(right) >= room(left) ? right : left }
}

/** Where someone `rise` metres from the seat stands to sit down, and is after standing up. */
export const besideOf = (seat: Seat, rise: number): Point => ({ x: seat.x + seat.side.x * rise, z: seat.z + seat.side.z * rise })

/** From the aisle round to beside the chair: along the aisle, then forward to its side. */
export const roundTheChair = (seat: Seat, rise: number): Point[] =>
  [seat.aisle, { x: seat.aisle.x + seat.side.x * rise, z: seat.aisle.z + seat.side.z * rise }, besideOf(seat, rise)]

/** Someone at their desk, getting up for the first time after `firstTripIn` seconds. */
export function routineAtDesk(seat: Seat, firstTripIn: number, rise: number): Routine {
  return {
    x: seat.x, z: seat.z, facing: seat.facing, pose: seat.pose, speed: 0, seat, rise, spot: null,
    steps: [{ kind: 'hold', pose: seat.pose, seconds: firstTripIn, facing: seat.facing }], current: null, left: 0,
  }
}

/** Someone already out at `spot`, heading back to their desk after `seconds`. */
export function routineAway(seat: Seat, spot: Spot, seconds: number, rise: number, w: RoutineWorld): Routine {
  w.taken.add(spot.id)
  const path = w.walk.findPath(spot, seat.aisle)
  const r: Routine = {
    x: spot.x, z: spot.z, facing: spot.facing, pose: spot.pose, speed: 0, seat, rise, spot: spot.id,
    steps: [{ kind: 'hold', pose: spot.pose, seconds, facing: spot.facing, release: spot.id }], current: null, left: 0,
  }
  r.steps.push(...backToDesk(r, path.length ? path : [spot, seat.aisle], w))
  return r
}

/** The way back: along open floor to the aisle, round beside the chair, back onto it, swivel to the
 * desk, work. `path` is the route to the aisle (planned before leaving the desk, so it is known to
 * exist). */
function backToDesk(r: Routine, path: Point[], w: RoutineWorld): Step[] {
  const seat = r.seat, away = facingOf(seat.side.x, seat.side.z)
  return [
    { kind: 'walk', path },
    { kind: 'walk', path: roundTheChair(seat, r.rise) },
    { kind: 'hold', pose: 'stand', seconds: SETTLE, facing: away },
    { kind: 'hold', pose: 'sit_down', seconds: w.clips.sit_down, facing: away, at: { x: seat.x, z: seat.z } },
    { kind: 'hold', pose: 'seated', seconds: SWIVEL, facing: seat.facing },
    { kind: 'hold', pose: seat.pose, seconds: 40 + w.rand() * 60, facing: seat.facing },
  ]
}

const free = (w: RoutineWorld, pose: Spot['pose']) => {
  const open = w.spots.filter((s) => s.pose === pose && !w.taken.has(s.id))
  return open.length ? open[Math.floor(w.rand() * open.length)] : null
}

/** Plan the next outing from the desk; if nowhere is free (or reachable), stay a little longer. */
function planOuting(r: Routine, w: RoutineWorld): Step[] {
  const seat = r.seat, away = facingOf(seat.side.x, seat.side.z)
  const stay: Step[] = [{ kind: 'hold', pose: seat.pose, seconds: 10 + w.rand() * 15, facing: seat.facing }]
  const leave: Step[] = [
    { kind: 'hold', pose: 'seated', seconds: SWIVEL, facing: away },
    { kind: 'hold', pose: 'stand_up', seconds: w.clips.stand_up, facing: away },
    { kind: 'hold', pose: 'stand', seconds: STEADY, facing: away, at: besideOf(seat, r.rise) },
    { kind: 'walk', path: roundTheChair(seat, r.rise).reverse() },
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
      ...backToDesk(r, back, w)]
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
    ...backToDesk(r, back, w)]
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
      if (next.kind === 'hold') {
        r.left = next.seconds
        if (next.at) { r.x = next.at.x; r.z = next.at.z }
      } else {
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
