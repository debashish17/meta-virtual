import { describe, expect, it } from 'vitest'
import { FURNITURE, OFFICE_WALK, zoneAt } from '@office/shared'
import { OFFICE_SPOTS, advance, routineAtDesk, routineAway, seatFor, type Routine, type RoutineWorld } from './routine'

/** Desk chairs in the team areas, as the colleagues use them. */
const chairs = FURNITURE.filter((p) => p.part === 'seating.task-chair-black' && zoneAt(p.x, p.z)?.id.startsWith('team_'))
const CLIPS = { sit_down: 2.2, stand_up: 2.0, interact: 1.6 }

function world(seed = 7): RoutineWorld {
  return { walk: OFFICE_WALK, spots: OFFICE_SPOTS, taken: new Set(), clips: CLIPS,
    rand: () => ((seed = (seed * 16807) % 2147483647) / 2147483647) }
}

/** Run a routine, recording each pose change and every position while walking. */
function run(r: Routine, w: RoutineWorld, seconds: number, dt = 0.1) {
  const poses: string[] = []
  const walked: { x: number; z: number }[] = []
  for (let t = 0; t < seconds; t += dt) {
    advance(r, dt, w)
    if (poses.at(-1) !== r.pose) poses.push(r.pose)
    if (r.pose === 'walk') walked.push({ x: r.x, z: r.z })
  }
  return { poses, walked }
}

describe('colleague routines', () => {
  it('get up from the desk, go to the tea point and back, and sit down facing the desk again', () => {
    const w = world()
    const seat = seatFor(chairs[5], 'type', OFFICE_WALK)
    const r = routineAtDesk(seat, 3)                 // first trip after 3 s
    const { poses } = run(r, w, 260)
    const trip = poses.join(' ')
    expect(trip).toMatch(/^type stand_up walk (interact stand walk talk|phone) walk sit_down type/)
    expect(r.pose).toBe('type')
    expect(Math.hypot(r.x - seat.x, r.z - seat.z)).toBeLessThan(0.01)
    expect(Math.abs(Math.atan2(Math.sin(r.facing - seat.facing), Math.cos(r.facing - seat.facing)))).toBeLessThan(0.05)
  })

  it('walk only through open floor, apart from the step out of and into the chair', () => {
    const w = world(11)
    for (const chair of chairs.slice(0, 6)) {
      const seat = seatFor(chair, 'type', OFFICE_WALK)
      const r = routineAtDesk(seat, 1)
      const { walked } = run(r, w, 200)
      expect(walked.length, `walked from ${chair.x}, ${chair.z}`).toBeGreaterThan(20)
      const reach = Math.hypot(seat.aisle.x - seat.x, seat.aisle.z - seat.z) + 0.05   // the step between chair and aisle
      const away = walked.filter((p) => Math.hypot(p.x - seat.x, p.z - seat.z) > reach)
      for (const p of away) expect(OFFICE_WALK.isWalkable(p.x, p.z), `(${p.x.toFixed(2)}, ${p.z.toFixed(2)})`).toBe(true)
    }
  })

  it('never puts two colleagues on the same spot', () => {
    const w = world(3)
    const people = chairs.slice(0, 12).map((c, i) => routineAtDesk(seatFor(c, 'type', OFFICE_WALK), 1 + i * 0.5))
    for (let t = 0; t < 300; t += 0.1) {
      for (const p of people) advance(p, 0.1, w)
      const held = people.map((p) => p.spot).filter((s): s is string => s !== null)
      expect(new Set(held).size, `t=${t.toFixed(1)}`).toBe(held.length)
    }
  })

  it('start some colleagues away from their desks, and bring them back', () => {
    const w = world(5)
    const seat = seatFor(chairs[9], 'type', OFFICE_WALK)
    const spot = OFFICE_SPOTS.find((s) => s.pose === 'talk')!
    const r = routineAway(seat, spot, 4, w)
    expect(r.pose).toBe('talk')
    expect(r.spot).toBe(spot.id)
    const { poses } = run(r, w, 60)
    expect(poses.slice(0, 4)).toEqual(['talk', 'walk', 'sit_down', 'type'])
    expect(r.spot).toBeNull()
  })

  it('places every spot on open floor', () => {
    for (const s of OFFICE_SPOTS) expect(OFFICE_WALK.isWalkable(s.x, s.z), s.id).toBe(true)
  })
})
