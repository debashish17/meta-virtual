import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { FURNITURE, LOOK_PRESETS, OFFICE_SPOTS, OFFICE_WALK, advance, inTheWay, riseOf, routineAtDesk, routineAway, seatFor, seatKey, secondsOf, zoneAt, type AvatarLook, type Point, type Routine, type RoutineWorld } from '@office/shared'
import Person, { type Motion } from './Person'
import { useMe } from './me'
import { TAKEN } from './taken'
import { avatar } from './state'
import { useNet } from '../net/store'

/**
 * Colleagues at work: the other preset employees, each with a desk, typing for a while and then
 * walking to the tea point for a drink and a chat (or to the windows for a phone call) and back
 * (routine.ts). Offline (no server) they run here, as always; online the server runs the shared
 * routines and `Players.tsx` draws them from the synced `npcs`, so this renders nothing
 * (`&colleagues=0` hides the offline ones).
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

/** The colleagues walking about offline (online the server runs them), for keeping apart. */
const live = new Set<Routine>()

/** Where the offline colleagues in the way are, but for `except` (sim/apart.ts). */
export function colleaguesInTheWay(except?: Routine): Point[] {
  const out: Point[] = []
  for (const r of live) if (r !== except && inTheWay(r.pose)) out.push({ x: r.x, z: r.z })
  return out
}

function Colleague({ name, look, routine, world, seed }: { name: string; look: AvatarLook; routine: Routine; world: RoutineWorld; seed: number }) {
  const group = useRef<THREE.Group>(null)
  const label = useRef<THREE.Group>(null)
  const motion = useRef<Motion>({ pose: routine.pose, speed: 0 })
  useEffect(() => {
    live.add(routine)
    return () => { live.delete(routine) }
  }, [routine])
  useFrame((_, dt) => {
    // the other colleagues and you, when in the way
    const others = colleaguesInTheWay(routine)
    if (inTheWay(avatar.pose)) others.push({ x: avatar.x, z: avatar.z })
    advance(routine, Math.min(dt, 0.1), { ...world, others })
    motion.current.pose = routine.pose
    motion.current.speed = routine.speed
    group.current?.position.set(routine.x, 0, routine.z)
    if (group.current) group.current.rotation.y = routine.facing
    const seated = routine.pose === 'type' || routine.pose === 'sit_talk' || routine.pose === 'seated'
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

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__officeNpcs = () =>
    Object.values(useNet.getState().npcs).map((n) => ({
      id: n.id, name: n.name, x: n.x, z: n.z, facing: n.facing, pose: n.pose,
    }))
}

export default function Colleagues() {
  const myName = useMe((s) => s.name)
  const status = useNet((s) => s.status)
  const selfId = useNet((s) => s.selfId)
  const crew = useMemo(() => {
    let seed = 20261101
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const others = LOOK_PRESETS.filter((p) => p.name.toLowerCase() !== myName.trim().toLowerCase())
    const chairs = seats(others.length)
    // one shared world for the reservations
    const world: RoutineWorld = {
      walk: OFFICE_WALK, spots: OFFICE_SPOTS, taken: TAKEN, rand,   // shared with you, so neither takes the other's place
      clips: { sit_down: secondsOf('sit_down'), stand_up: secondsOf('stand_up'), interact: secondsOf('interact') },
    }
    const people = others.map((person, i) => {
      const seat = seatFor(chairs[i], i === 2 ? 'sit_talk' : 'type', OFFICE_WALK)
      TAKEN.add(seatKey(chairs[i]))   // their desk is theirs
      const away = STARTS_AWAY[person.id]
      const spot = away && OFFICE_SPOTS.find((s) => s.id === away[0])
      const rise = riseOf(person.look)
      const routine = spot ? routineAway(seat, spot, away[1], rise, world) : routineAtDesk(seat, 6 + i * 9 + rand() * 10, rise)
      return { person, routine }
    })
    return { world, people }
  }, [myName])
  // Online the colleagues come from the server (Players.tsx draws the synced npcs); the local
  // routines stop with their unmounted frames and resume from their reservations when offline.
  const online = (status === 'online' || status === 'reconnecting') && selfId !== null
  if (!SHOW || online) return null
  return (
    <>
      {crew.people.map(({ person, routine }, i) => (
        <Colleague key={person.id} name={person.name} look={person.look} routine={routine} world={crew.world} seed={i + 1} />
      ))}
    </>
  )
}
