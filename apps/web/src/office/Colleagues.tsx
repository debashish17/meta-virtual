import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { BODIES, FURNITURE, LOOK_PRESETS, OFFICE_WALK, zoneAt, type AvatarLook } from '@office/shared'
import Person, { type Motion } from './Person'
import { useMe } from './me'
import { TAKEN, seatKey } from './interactions'
import { OFFICE_SPOTS, advance, routineAtDesk, routineAway, seatFor, type Routine, type RoutineWorld } from './routine'

/**
 * Colleagues at work: the other preset employees, each with a desk, typing for a while and then
 * walking to the tea point for a drink and a chat (or to the windows for a phone call) and back
 * (routine.ts). They are scenery for now; in M3 the people in the office come from the server and
 * this goes away (`&colleagues=0` hides them today).
 */

const SHOW = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('colleagues') !== '0'

/** Desk chairs in the team areas, spread across the teams and rows. */
function seats(count: number) {
  const chairs = FURNITURE.filter((p) => p.part === 'seating.task-chair-black' && zoneAt(p.x, p.z)?.id.startsWith('team_'))
  const byTeam = new Map<string, typeof chairs>()
  for (const c of chairs) {
    const team = zoneAt(c.x, c.z)!.id
    byTeam.set(team, [...(byTeam.get(team) ?? []), c])
  }
  const picks: typeof chairs = []
  for (let round = 0; picks.length < count && round < 6; round++) {
    for (const list of byTeam.values()) {
      const step = Math.floor(list.length / 3)
      const chair = list[(round * step + round * 5 + 3) % list.length]
      if (picks.length < count && !picks.includes(chair)) picks.push(chair)
    }
  }
  return picks
}

// who starts the day away from their desk: (preset id, spot, seconds before heading back)
const STARTS_AWAY: Record<string, [string, number]> = { kenji: ['chat_1', 25], sofia: ['chat_2', 25], ben: ['window_1', 18] }

function Colleague({ name, look, routine, world, seed }: { name: string; look: AvatarLook; routine: Routine; world: RoutineWorld; seed: number }) {
  const group = useRef<THREE.Group>(null)
  const label = useRef<THREE.Group>(null)
  const motion = useRef<Motion>({ pose: routine.pose, speed: 0 })
  useFrame((_, dt) => {
    advance(routine, Math.min(dt, 0.1), world)
    motion.current.pose = routine.pose
    motion.current.speed = routine.speed
    group.current?.position.set(routine.x, 0, routine.z)
    if (group.current) group.current.rotation.y = routine.facing
    const seated = routine.pose === 'type' || routine.pose === 'sit_talk' || routine.pose === 'sit'
    label.current?.position.setY(seated ? 1.45 : look.height + 0.3)
  })
  return (
    <group ref={group} position={[routine.x, 0, routine.z]} rotation-y={routine.facing}>
      <Person look={look} motion={motion.current} seed={seed} />
      <group ref={label}>
        <Html center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="office-name colleague">{name}</div>
        </Html>
      </group>
    </group>
  )
}

export default function Colleagues() {
  const myName = useMe((s) => s.name)
  const crew = useMemo(() => {
    let seed = 20261101
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const others = LOOK_PRESETS.filter((p) => p.name.toLowerCase() !== myName.trim().toLowerCase())
    const chairs = seats(others.length)
    // one shared world for the reservations; sitting down and standing up are blends of about a second
    const interact = BODIES.moves.clips.find((c) => c.name === 'interact')?.seconds ?? 3
    const world: RoutineWorld = {
      walk: OFFICE_WALK, spots: OFFICE_SPOTS, taken: TAKEN, rand,   // shared with you, so neither takes the other's place
      clips: { sit_down: 0.9, stand_up: 0.9, interact },
    }
    const people = others.map((person, i) => {
      const seat = seatFor(chairs[i], i === 2 ? 'sit_talk' : 'type', OFFICE_WALK)
      TAKEN.add(seatKey(chairs[i]))   // their desk is theirs
      const away = STARTS_AWAY[person.id]
      const spot = away && OFFICE_SPOTS.find((s) => s.id === away[0])
      const routine = spot ? routineAway(seat, spot, away[1], world) : routineAtDesk(seat, 6 + i * 9 + rand() * 10)
      return { person, routine }
    })
    return { world, people }
  }, [myName])
  if (!SHOW) return null
  return (
    <>
      {crew.people.map(({ person, routine }, i) => (
        <Colleague key={person.id} name={person.name} look={person.look} routine={routine} world={crew.world} seed={i + 1} />
      ))}
    </>
  )
}
