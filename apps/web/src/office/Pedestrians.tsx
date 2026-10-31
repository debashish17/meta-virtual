import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { WORLD, lookFromSeed } from '@office/shared'
import Person, { type Motion } from './Person'

/**
 * Passers-by on the pavements round the office's block, in both directions at their own pace, so
 * the street has life. Their loop keeps clear of the planters, benches, bike racks and the sign by
 * the door (see city.ts). Scenery only: nothing in the office depends on them.
 */

const { width: W, depth: D } = WORLD
const WALK_Y = -0.15
// the loop's corners: west, north and south pavements, and the strip between the windows and the benches
const LOOP: [number, number][] = [[-4, -2.6], [W + 1.0, -2.6], [W + 1.0, D + 4.3], [-4, D + 4.3]]
const SEGMENTS = LOOP.map((a, i) => {
  const b = LOOP[(i + 1) % LOOP.length]
  return { a, b, length: Math.hypot(b[0] - a[0], b[1] - a[1]) }
})
const PERIMETER = SEGMENTS.reduce((n, s) => n + s.length, 0)
const COUNT = 10

/** Point on the loop `s` metres from its first corner, shifted `lane` metres to the walker's right. */
function along(s: number, lane: number, dir: 1 | -1) {
  s = ((s % PERIMETER) + PERIMETER) % PERIMETER
  for (const seg of SEGMENTS) {
    if (s <= seg.length) {
      const t = s / seg.length
      const dx = (seg.b[0] - seg.a[0]) / seg.length, dz = (seg.b[1] - seg.a[1]) / seg.length
      const [fx, fz] = [dx * dir, dz * dir]                 // walking direction
      return { x: seg.a[0] + (seg.b[0] - seg.a[0]) * t - fz * lane, z: seg.a[1] + (seg.b[1] - seg.a[1]) * t + fx * lane, heading: Math.atan2(fx, fz) }
    }
    s -= seg.length
  }
  return { x: LOOP[0][0], z: LOOP[0][1], heading: 0 }
}

const blob = (() => {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  r.addColorStop(0, 'rgba(20,24,28,0.4)')
  r.addColorStop(1, 'rgba(20,24,28,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 64, 64)
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })
})()
const BLOB = new THREE.PlaneGeometry(0.75, 0.75).rotateX(-Math.PI / 2)

function Walker({ index }: { index: number }) {
  const group = useRef<THREE.Group>(null)
  const spec = useMemo(() => {
    const look = lookFromSeed(`passer-by-${index}`)
    const dir: 1 | -1 = index % 2 ? 1 : -1
    return { look, dir, speed: 1.15 + ((index * 37) % 10) * 0.04, start: (index / COUNT) * PERIMETER, lane: 0.45 }
  }, [index])
  const motion = useRef<Motion>({ pose: 'walk', speed: spec.speed })
  const heading = useRef<number | null>(null)
  useFrame((state) => {
    const g = group.current
    if (!g) return
    const p = along(spec.start + spec.dir * spec.speed * state.clock.elapsedTime, spec.lane, spec.dir)
    g.position.set(p.x, WALK_Y, p.z)
    // turn the corners smoothly
    if (heading.current === null) heading.current = p.heading
    const d = Math.atan2(Math.sin(p.heading - heading.current), Math.cos(p.heading - heading.current))
    heading.current += d * 0.15
    g.rotation.y = heading.current
  })
  return (
    <group ref={group}>
      {blob && <mesh geometry={BLOB} material={blob} position-y={0.01} renderOrder={1} />}
      <Person look={spec.look} motion={motion.current} seed={index} />
    </group>
  )
}

export default function Pedestrians() {
  return <>{Array.from({ length: COUNT }, (_, i) => <Walker key={i} index={i} />)}</>
}
