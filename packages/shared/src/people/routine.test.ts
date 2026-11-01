import { describe, expect, it } from 'vitest'
import { FURNITURE, OFFICE_WALK, zoneAt } from '../world/index.js'
import { OFFICE_SPOTS, advance, besideOf, routineAtDesk, routineAway, seatFor, type Routine, type RoutineWorld } from './routine.js'

/** Desk chairs in the team areas, as the colleagues use them. */
const chairs = FURNITURE.filter((p) => p.part === 'seating.task-chair-black' && zoneAt(p.x, p.z)?.id.startsWith('team_'))
const CLIPS = { sit_down: 2.2, stand_up: 2.3, interact: 1.6 }
const RISE = 0.5      // seat to where they stand, at their height (the moves' stand-to-seat distance)
const angle = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))

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
    const r = routineAtDesk(seat, 3, RISE)           // first trip after 3 s
    const { poses } = run(r, w, 260)
    const trip = poses.join(' ')
    expect(trip).toMatch(/^type seated stand_up stand walk (interact stand walk talk|phone) walk stand sit_down seated type/)
    expect(r.pose).toBe('type')
    expect(Math.hypot(r.x - seat.x, r.z - seat.z)).toBeLessThan(0.01)
    expect(angle(r.facing, seat.facing)).toBeLessThan(0.05)
  })

  it('sit down backing onto the chair from beside it, turn to the desk, and stand up beside it again', () => {
    const w = world(2)
    const seat = seatFor(chairs[5], 'type', OFFICE_WALK)
    const beside = besideOf(seat, RISE)
    const away = Math.atan2(seat.side.x, seat.side.z)          // facing away from the chair, towards the side
    expect(Math.hypot(seat.side.x, seat.side.z)).toBeCloseTo(1, 6)
    expect(Math.abs(seat.side.x * Math.sin(seat.facing) + seat.side.z * Math.cos(seat.facing))).toBeLessThan(1e-6)
    // the side away from the next chair along the desk
    for (const c of chairs.filter((c) => c !== chairs[5])) expect(Math.hypot(c.x - beside.x, c.z - beside.z)).toBeGreaterThan(1.2)
    const r = routineAtDesk(seat, 2, RISE)
    const at: Record<string, { x: number; z: number; facing: number }[]> = {}
    let last = r.pose
    for (let t = 0; t < 260; t += 0.05) {
      const before = { pose: r.pose, x: r.x, z: r.z, facing: r.facing }
      advance(r, 0.05, w)
      if (r.pose !== last) (at[`${last}>${r.pose}`] ??= []).push(before, { x: r.x, z: r.z, facing: r.facing })
      last = r.pose
    }
    const near = (p: { x: number; z: number }, q: { x: number; z: number }) => Math.hypot(p.x - q.x, p.z - q.z)
    // getting up: swivel to face the side in the chair, stand up, and be standing beside it
    const [inChair, up] = at['seated>stand_up']
    expect(near(inChair, seat)).toBeLessThan(0.01)
    expect(angle(up.facing, away)).toBeLessThan(0.05)
    const [, standing] = at['stand_up>stand']
    expect(near(standing, beside)).toBeLessThan(0.01)
    // back again: stand beside the chair with your back to it, then sit down into it
    const [ready, sitting] = at['stand>sit_down']
    expect(near(ready, beside)).toBeLessThan(0.01)
    expect(angle(ready.facing, away)).toBeLessThan(0.05)
    expect(near(sitting, seat)).toBeLessThan(0.01)
    const [, swivelled] = at['seated>type']
    expect(near(swivelled, seat)).toBeLessThan(0.01)
    expect(angle(swivelled.facing, seat.facing)).toBeLessThan(0.05)
  })

  it('walk only through open floor, apart from the step out of and into the chair', () => {
    const w = world(11)
    for (const chair of chairs.slice(0, 6)) {
      const seat = seatFor(chair, 'type', OFFICE_WALK)
      const r = routineAtDesk(seat, 1, RISE)
      const { walked } = run(r, w, 200)
      expect(walked.length, `walked from ${chair.x}, ${chair.z}`).toBeGreaterThan(20)
      // the step between the aisle and the side of the chair: from the aisle beside the chair to beside it
      const a = { x: seat.aisle.x + seat.side.x * RISE, z: seat.aisle.z + seat.side.z * RISE }, b = besideOf(seat, RISE)
      const onStep = (p: { x: number; z: number }) => {
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / ((b.x - a.x) ** 2 + (b.z - a.z) ** 2)))
        return Math.hypot(p.x - a.x - t * (b.x - a.x), p.z - a.z - t * (b.z - a.z)) < 0.02
      }
      for (const p of walked.filter((q) => !onStep(q))) expect(OFFICE_WALK.isWalkable(p.x, p.z), `(${p.x.toFixed(2)}, ${p.z.toFixed(2)})`).toBe(true)
    }
  })

  it('never puts two colleagues on the same spot', () => {
    const w = world(3)
    const people = chairs.slice(0, 12).map((c, i) => routineAtDesk(seatFor(c, 'type', OFFICE_WALK), 1 + i * 0.5, RISE))
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
    const r = routineAway(seat, spot, 4, RISE, w)
    expect(r.pose).toBe('talk')
    expect(r.spot).toBe(spot.id)
    const { poses } = run(r, w, 60)
    expect(poses.slice(0, 6)).toEqual(['talk', 'walk', 'stand', 'sit_down', 'seated', 'type'])
    expect(r.spot).toBeNull()
  })

  it('places every spot on open floor', () => {
    for (const s of OFFICE_SPOTS) expect(OFFICE_WALK.isWalkable(s.x, s.z), s.id).toBe(true)
  })
})
