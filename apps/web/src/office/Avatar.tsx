import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { OFFICE_WALK, WalkMap, findPath, zoneAt, type Point } from '@office/shared'
import { TAKEN, advanceActivity, approachOf, startActivity, targetNear, type Activity, type Target } from './interactions'
import Person, { type Motion } from './Person'
import { useMe } from './me'
import { riseOf, secondsOf } from './moves'
import { avatar, useOfficeUi } from './state'

/**
 * The local avatar (DESIGN_SPEC 7): a Person in the employee's own look (me.ts), with a
 * walk cycle, grounded by a soft blob shadow (it is not in the sun's shadow map, which only
 * redraws for static geometry), a facing marker and a name pill. WASD / arrow keys walk in screen directions (up walks up the
 * screen); clicking the floor walks there along findPath. Movement goes through the shared
 * WalkMap.step, so it can never enter walls, glass or furniture. Clicking a free desk chair or the
 * tea counter (or pressing E beside one) walks there and sits down to type, or makes a drink
 * (interactions.ts); moving off stands up again.
 */

const WALK = 2.3, JOG = WalkMap.MAX_SPEED   // m/s
// screen directions on the floor for the south-west camera
const SCREEN_UP: Point = { x: Math.SQRT1_2, z: -Math.SQRT1_2 }
const SCREEN_RIGHT: Point = { x: Math.SQRT1_2, z: Math.SQRT1_2 }

const KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
}

/** Pending click-to-move route, set by the floor and walked by the avatar. */
export const route: { points: Point[] } = { points: [] }

/** What you are doing besides walking: the chair or counter you are heading for, the activity once
 * there, and where to go once you have stood up. */
const doing: { activity: Activity; pending: Target | null; after: Point | null; standUp: boolean } =
  { activity: { kind: 'free' }, pending: null, after: null, standUp: false }
const SECONDS = { sit_down: secondsOf('sit_down'), stand_up: secondsOf('stand_up'), interact: secondsOf('interact') }
const holding = (): string | null => doing.pending?.id ?? (doing.activity.kind === 'free' ? null : doing.activity.target.id)
function letGo() {
  const id = holding()
  if (id) TAKEN.delete(id)
  doing.pending = null
}

/** Walk to a floor point; or, if it is a free desk chair or counter, go and use it. */
export function walkTo(point: Point) {
  if (doing.activity.kind !== 'free') { doing.after = point; return }   // stand up first, then go
  letGo()
  const target = targetNear(point, TAKEN)
  if (target) {
    TAKEN.add(target.id)
    doing.pending = target
    const at = approachOf(target)
    route.points = findPath({ x: avatar.x, z: avatar.z }, at).slice(1)
    if (!route.points.length && Math.hypot(avatar.x - at.x, avatar.z - at.z) > 0.35) letGo()   // cannot get there
    return
  }
  const goal = OFFICE_WALK.nearestWalkable(point, 1.5)
  route.points = goal ? findPath({ x: avatar.x, z: avatar.z }, goal).slice(1) : []
}

/** E: use the chair or counter beside you, or stand up / step away if you are using one. */
function interact() {
  if (doing.activity.kind !== 'free') { doing.standUp = true; return }
  const target = targetNear({ x: avatar.x, z: avatar.z }, TAKEN, 2.2)
  if (target) walkTo(target.kind === 'seat' ? target.seat : target.spot)
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  // test hook for screenshots and manual checks: __officeDebug.teleport(x, z), .walkTo({x, z})
  (window as unknown as Record<string, unknown>).__officeDebug = {
    avatar, walkTo, route, walk: OFFICE_WALK, doing, interact,
    teleport: (x: number, z: number) => { letGo(); doing.activity = { kind: 'free' }; avatar.x = x; avatar.z = z; route.points = [] },
  }
}

function useKeys() {
  const held = useRef(new Set<string>())
  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return
      if (e.code === 'KeyE' && !e.repeat) interact()
      if (KEYS[e.code] || e.code.startsWith('Shift')) held.current.add(e.code)
      if (KEYS[e.code]) e.preventDefault()
    }
    const up = (e: KeyboardEvent) => held.current.delete(e.code)
    const clear = () => held.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear) }
  }, [])
  return held
}

export default function Avatar() {
  const root = useRef<THREE.Group>(null)
  const marker = useRef<THREE.Mesh>(null)
  const held = useKeys()
  const motion = useRef<Motion>({ pose: 'stand', speed: 0 })
  const setZone = useOfficeUi((s) => s.setZone)
  const name = useMe((s) => s.name)
  const look = useMe((s) => s.look)
  const shadowMap = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    r.addColorStop(0, 'rgba(0,0,0,0.45)')
    r.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
  }, [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    let [sx, sy] = [0, 0]
    for (const code of held.current) if (KEYS[code]) { sx += KEYS[code][0]; sy += KEYS[code][1] }
    const m = motion.current
    if (doing.activity.kind !== 'free') {
      // sitting, typing, standing up or at the counter: the activity moves you; keys or a click end it
      const using = holding()
      const out = advanceActivity(doing.activity, avatar, dt, !!(sx || sy) || doing.after !== null || doing.standUp, { ...SECONDS, rise: riseOf(look) })
      doing.activity = out.activity
      m.pose = out.pose ?? 'stand'
      m.speed = out.speed
      if (out.activity.kind === 'free') {
        if (using) TAKEN.delete(using)   // the chair or counter is free again
        doing.standUp = false
        const after = doing.after
        doing.after = null
        if (after) walkTo(after)
      }
      root.current?.position.set(avatar.x, 0, avatar.z)
      if (root.current) root.current.rotation.y = avatar.facing
      if (marker.current) marker.current.visible = false
      return
    }
    let dir: Point = { x: 0, z: 0 }
    if (sx || sy) {
      route.points = []
      if (doing.pending) letGo()   // walked off instead
      dir = { x: SCREEN_RIGHT.x * sx + SCREEN_UP.x * sy, z: SCREEN_RIGHT.z * sx + SCREEN_UP.z * sy }
    } else {
      while (route.points.length && Math.hypot(route.points[0].x - avatar.x, route.points[0].z - avatar.z) < 0.06) {
        route.points.shift()   // reached: aim at the next waypoint this same frame
      }
      if (route.points.length) dir = { x: route.points[0].x - avatar.x, z: route.points[0].z - avatar.z }
    }
    const speed = [...held.current].some((c) => c.startsWith('Shift')) ? JOG : WALK
    const before = { x: avatar.x, z: avatar.z }
    const following = !(sx || sy) && route.points.length > 0
    const toWaypoint = following ? Math.hypot(route.points[0].x - before.x, route.points[0].z - before.z) : Infinity
    const next = OFFICE_WALK.step(before, dir, Math.min(dt, toWaypoint / speed), speed)   // stop on the waypoint
    const moved = Math.hypot(next.x - before.x, next.z - before.z)
    if (following && dt > 0 && moved < 1e-5) { route.points = []; letGo() }   // tried to move and could not: give up the route
    if (doing.pending && !route.points.length) {
      // arrived (or as near as the route goes): start sitting down or using the counter
      const at = approachOf(doing.pending)
      if (Math.hypot(at.x - next.x, at.z - next.z) < 0.35) {
        doing.activity = startActivity(doing.pending)
        doing.pending = null
      } else letGo()
    }
    avatar.x = next.x
    avatar.z = next.z
    if (moved > 1e-4) {
      const want = Math.atan2(next.x - before.x, next.z - before.z)
      const delta = Math.atan2(Math.sin(want - avatar.facing), Math.cos(want - avatar.facing))
      avatar.facing += delta * Math.min(1, dt * 12)
    }
    m.speed += ((dt > 0 ? moved / dt : 0) - m.speed) * Math.min(1, dt * 12)
    m.pose = m.speed < 0.15 ? 'stand' : m.speed > (WALK + JOG) / 2 ? 'jog' : 'walk'
    if (root.current) {
      root.current.position.set(avatar.x, 0, avatar.z)
      root.current.rotation.y = avatar.facing
    }
    const dest = route.points.at(-1)
    if (marker.current) {
      marker.current.visible = !!dest
      if (dest) marker.current.position.set(dest.x, 0.012, dest.z)
    }
    const zone = zoneAt(avatar.x, avatar.z)
    if (zone?.id !== useOfficeUi.getState().zone?.id) setZone(zone)
  })

  return (
    <>
      <group ref={root}>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, 0]}>
          <planeGeometry args={[0.8, 0.8]} />
          <meshBasicMaterial map={shadowMap} transparent depthWrite={false} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.008, 0.36]}>   {/* facing marker */}
          <circleGeometry args={[0.07, 3]} />
          <meshBasicMaterial color={look.top} transparent opacity={0.8} />
        </mesh>
        <Person look={look} motion={motion.current} />
        <Html position={[0, look.height + 0.33, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="office-name">{name}</div>
        </Html>
      </group>
      <mesh ref={marker} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.18, 0.24, 32]} />
        <meshBasicMaterial color="#c9803f" transparent opacity={0.85} depthWrite={false} />
      </mesh>
    </>
  )
}
