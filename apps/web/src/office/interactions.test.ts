import { describe, expect, it } from 'vitest'
import { OFFICE_WALK } from '@office/shared'
import { COUNTERS, DESK_SEATS, advanceActivity, approachOf, startActivity, targetNear, type Activity, type Body } from './interactions'

const SECONDS = { blend: 0.9, interact: 3.2 }
const body = (x: number, z: number): Body => ({ x, z, facing: 0 })

/** Run an activity until it settles or `seconds` pass; record the poses it went through. */
function run(a: Activity, me: Body, seconds: number, wantsToMove = false, dt = 0.05) {
  const poses: string[] = []
  for (let t = 0; t < seconds && a.kind !== 'free'; t += dt) {
    const out = advanceActivity(a, me, dt, wantsToMove, SECONDS)
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

  it('steps into the chair, sits down, types, and stands up again when you move', () => {
    const seat = DESK_SEATS[4]
    const me = body(seat.aisle.x, seat.aisle.z)
    const seated = run(startActivity({ kind: 'seat', id: seat.id, seat }), me, 10)
    expect(seated.poses).toEqual(['walk', 'sit_down', 'type'])
    expect(seated.activity.kind).toBe('seated')
    expect(Math.hypot(me.x - seat.x, me.z - seat.z)).toBeLessThan(0.01)
    expect(Math.abs(Math.atan2(Math.sin(me.facing - seat.facing), Math.cos(me.facing - seat.facing)))).toBeLessThan(0.05)
    const up = run(seated.activity, me, 10, true)
    expect(up.poses).toEqual(['stand_up', 'walk'])
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
})
