import { describe, expect, it } from 'vitest'
import { OFFICE_WALK } from '@office/shared'
import { COUNTERS, DESK_SEATS, advanceActivity, approachOf, startActivity, targetNear, type Activity, type Body } from './interactions'
import { besideOf } from './routine'

const MOVES = { sit_down: 2.2, stand_up: 2.3, interact: 3.2, rise: 0.5 }   // seconds, and seat to standing spot (m)
const body = (x: number, z: number): Body => ({ x, z, facing: 0 })

/** Run an activity until it settles or `seconds` pass; record the poses it went through. */
function run(a: Activity, me: Body, seconds: number, wantsToMove = false, dt = 0.05) {
  const poses: string[] = []
  for (let t = 0; t < seconds && a.kind !== 'free'; t += dt) {
    const out = advanceActivity(a, me, dt, wantsToMove, MOVES)
    a = out.activity
    if (out.pose && poses.at(-1) !== out.pose) poses.push(out.pose)
  }
  return { activity: a, poses }
}

describe('your interactions', () => {
  it('finds the desk chair or counter you click on, and nothing on open floor', () => {
    const seat = DESK_SEATS[4]
    expect(targetNear({ x: seat.x + 0.3, z: seat.z - 0.2 }, new Set())).toMatchObject({ kind: 'seat', id: seat.id })
    const counter = COUNTERS[0]
    expect(targetNear({ x: counter.x, z: counter.z - 0.9 }, new Set())).toMatchObject({ kind: 'counter', id: counter.id })
    expect(targetNear({ x: 30, z: 21 }, new Set())).toBeNull()   // the main street
  })

  it('skips seats and counters someone else holds', () => {
    const seat = DESK_SEATS[4]
    const near = { x: seat.x + 0.1, z: seat.z }
    const other = targetNear(near, new Set([seat.id]))
    expect(other?.id).not.toBe(seat.id)
  })

  it('approaches a seat from the open floor behind it, and a counter on its spot', () => {
    for (const seat of DESK_SEATS) expect(OFFICE_WALK.isWalkable(seat.aisle.x, seat.aisle.z), seat.id).toBe(true)
    const seat = DESK_SEATS[4]
    expect(approachOf({ kind: 'seat', id: seat.id, seat })).toEqual(seat.aisle)
    const c = COUNTERS[0]
    expect(approachOf({ kind: 'counter', id: c.id, spot: c })).toEqual({ x: c.x, z: c.z })
  })

  it('steps round beside the chair, sits down, turns to the desk and types, and stands up again when you move', () => {
    const seat = DESK_SEATS[4]
    const me = body(seat.aisle.x, seat.aisle.z)
    const seated = run(startActivity({ kind: 'seat', id: seat.id, seat }), me, 12)
    expect(seated.poses).toEqual(['walk', 'stand', 'sit_down', 'seated', 'type'])
    expect(seated.activity.kind).toBe('seated')
    expect(Math.hypot(me.x - seat.x, me.z - seat.z)).toBeLessThan(0.01)
    expect(Math.abs(Math.atan2(Math.sin(me.facing - seat.facing), Math.cos(me.facing - seat.facing)))).toBeLessThan(0.05)
    const up = run(seated.activity, me, 12, true)
    expect(up.poses).toEqual(['seated', 'stand_up', 'stand', 'walk'])
    expect(up.activity.kind).toBe('free')
    expect(Math.hypot(me.x - seat.aisle.x, me.z - seat.aisle.z)).toBeLessThan(0.01)
    expect(OFFICE_WALK.isWalkable(me.x, me.z)).toBe(true)
  })

  it('makes a drink at the counter, then is free again (or straight away if you move off)', () => {
    const c = COUNTERS[0]
    const me = body(c.x, c.z)
    const used = run(startActivity({ kind: 'counter', id: c.id, spot: c }), me, 10)
    expect(used.poses).toEqual(['interact', 'stand'])
    expect(used.activity.kind).toBe('free')
    const cut = run(startActivity({ kind: 'counter', id: c.id, spot: c }), body(c.x, c.z), 10, true)
    expect(cut.activity.kind).toBe('free')
  })

  it('sits down from beside the chair with its back to it, and stands up there', () => {
    const seat = DESK_SEATS[4]
    const beside = besideOf(seat, MOVES.rise)
    const away = Math.atan2(seat.side.x, seat.side.z)
    const me = body(seat.aisle.x, seat.aisle.z)
    let a: Activity = startActivity({ kind: 'seat', id: seat.id, seat })
    const seen: Record<string, Body> = {}
    let pose = ''
    for (let t = 0; t < 30; t += 0.05) {
      const before = { ...me }
      const out = advanceActivity(a, me, 0.05, a.kind === 'seated' && t > 12, MOVES)
      a = out.activity
      if (out.pose && out.pose !== pose) { seen[`${pose}>${out.pose}`] = before; seen[out.pose] = { ...me } }
      pose = out.pose ?? pose
      if (a.kind === 'free') break
    }
    const d = (p: Body, q: { x: number; z: number }) => Math.hypot(p.x - q.x, p.z - q.z)
    const delta = (x: number, y: number) => Math.abs(Math.atan2(Math.sin(x - y), Math.cos(x - y)))
    expect(d(seen['stand>sit_down'], beside)).toBeLessThan(0.01)          // standing beside it, back to the chair
    expect(delta(seen['stand>sit_down'].facing, away)).toBeLessThan(0.05)
    expect(d(seen.sit_down, seat)).toBeLessThan(0.01)                     // then down into it
    expect(d(seen['stand_up>stand'], seat)).toBeLessThan(0.01)            // up out of it...
    expect(d(seen.stand, beside)).toBeLessThan(0.01)                      // ...and standing beside it
    expect(a.kind).toBe('free')
  })
})
