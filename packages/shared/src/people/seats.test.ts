import { describe, expect, it } from 'vitest'
import { OFFICE_WALK, WORLD, findPath, zoneAt } from '../world/index.js'
import { ALL_SEATS, COUNTERS, DESK_SEATS, advanceActivity, approachOf, startActivity, targetNear, type Activity, type Body } from './activity.js'
import { homeDeskSeatIds } from './desks.js'
import { FREE_SEATS } from './seats.js'

const MOVES = { sit_down: 2.2, stand_up: 2.3, interact: 3.2, rise: 0.5 }
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

const byPart = (part: string) => FREE_SEATS.filter((s) => s.part === part)

describe('free seating', () => {
  it('covers lounge armchairs, sofas, café chairs and meeting-room chairs', () => {
    const parts = new Set(FREE_SEATS.map((s) => s.part))
    for (const part of [
      'lounge.lounge-chair-fabric', 'lounge.lounge-chair-leather', 'lounge.accent-chair-light',
      'lounge.sofa-2-seater', 'lounge.3-seater-sofa', 'lounge.high-back-sofa',
      'seating.visitor-chair', 'seating.conference-chair', 'seating.executive-chair',
      'seating.task-chair-black', 'seating.task-chair-grey',
    ]) expect(parts.has(part), part).toBe(true)
    // Bar stools are left out: the sit-down sinks through them (see seats.ts).
    for (const part of ['seating.bar-stool-with-back', 'seating.bar-stool-backless']) {
      expect(FREE_SEATS.some((s) => s.part === part), part).toBe(false)
    }
    expect(FREE_SEATS.length).toBeGreaterThan(DESK_SEATS.length)
  })

  it('gives every seat its own seat:x,z id, never a desk seat or a home desk', () => {
    const ids = FREE_SEATS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^seat:-?\d+\.\d\d,-?\d+\.\d\d$/)
    const desks = new Set(DESK_SEATS.map((s) => s.id))
    for (const id of ids) expect(desks.has(id), id).toBe(false)
    const homes = new Set(homeDeskSeatIds())
    for (const id of ids) expect(homes.has(id), id).toBe(false)
    expect(ALL_SEATS.map((s) => s.id)).toEqual([...DESK_SEATS.map((s) => s.id), ...ids])
  })

  it('seats sofas per cushion, facing the table', () => {
    expect(byPart('lounge.sofa-2-seater').length).toBeGreaterThan(0)
    expect(byPart('lounge.3-seater-sofa').map((s) => s.id)).toHaveLength(3)
    const two = byPart('lounge.sofa-2-seater')
    expect(two.length % 2).toBe(0)
    // the window-lounge 3-seater faces its coffee table (west, -x)
    const three = byPart('lounge.3-seater-sofa')
    const delta = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
    for (const s of three) expect(delta(s.facing, -Math.PI / 2)).toBeLessThan(0.01)
    expect(new Set(three.map((s) => s.z)).size).toBe(3)
  })

  it('walks every free seat from the spawn: the approach is open floor, in-zone and reachable', () => {
    for (const s of FREE_SEATS) {
      const where = `${s.part} ${s.id}`
      expect(OFFICE_WALK.isWalkable(s.aisle.x, s.aisle.z), where).toBe(true)
      expect(zoneAt(s.aisle.x, s.aisle.z)?.id ?? null, where).toBe(zoneAt(s.x, s.z)?.id ?? null)
      expect(findPath(WORLD.spawn, s.aisle).length, where).toBeGreaterThan(0)
    }
  })

  it('offers free seats through the same lookup as desk chairs, skipping taken ones', () => {
    const lounge = byPart('lounge.lounge-chair-fabric')[0]
    expect(targetNear({ x: lounge.x, z: lounge.z }, new Set())).toMatchObject({ kind: 'seat', id: lounge.id })
    const sofa = byPart('lounge.sofa-2-seater')[0]
    expect(targetNear({ x: sofa.x, z: sofa.z }, new Set())).toMatchObject({ kind: 'seat', id: sofa.id })
    const meeting = byPart('lounge.accent-chair-light')[0] ?? byPart('seating.conference-chair')[0]
    expect(targetNear({ x: meeting.x, z: meeting.z }, new Set())).toMatchObject({ kind: 'seat', id: meeting.id })
    const near = { x: lounge.x, z: lounge.z }
    expect(targetNear(near, new Set([lounge.id]))?.id).not.toBe(lounge.id)
    expect(COUNTERS.length).toBeGreaterThan(0)
  })

  it('sits a free seat down to sit_talk, and a desk seat still to type', () => {
    const free = byPart('lounge.lounge-chair-leather')[0]
    const me = body(free.aisle.x, free.aisle.z)
    const sat = run(startActivity({ kind: 'seat', id: free.id, seat: free }), me, 15)
    expect(sat.activity.kind).toBe('seated')
    expect(sat.poses).toEqual(['walk', 'stand', 'sit_down', 'seated', 'sit_talk'])
    expect(Math.hypot(me.x - free.x, me.z - free.z)).toBeLessThan(0.01)
    const up = run(sat.activity, me, 15, true)
    expect(up.activity.kind).toBe('free')
    expect(OFFICE_WALK.isWalkable(me.x, me.z)).toBe(true)

    const desk = DESK_SEATS[4]
    const worker = body(desk.aisle.x, desk.aisle.z)
    const typed = run(startActivity({ kind: 'seat', id: desk.id, seat: desk }), worker, 15)
    expect(typed.poses).toEqual(['walk', 'stand', 'sit_down', 'seated', 'type'])
  })

  it('sits every free seat down and up again without getting stuck', () => {
    for (const s of FREE_SEATS) {
      const me = body(s.aisle.x, s.aisle.z)
      const sat = run(startActivity({ kind: 'seat', id: s.id, seat: s }), me, 20)
      expect(sat.activity.kind, `${s.part} ${s.id} sits`).toBe('seated')
      const up = run(sat.activity, me, 20, true)
      expect(up.activity.kind, `${s.part} ${s.id} stands`).toBe('free')
    }
  })

  it('approaches a free seat from its aisle like any seat', () => {
    const s = FREE_SEATS[0]
    expect(approachOf({ kind: 'seat', id: s.id, seat: s })).toEqual(s.aisle)
  })
})
