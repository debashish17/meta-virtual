import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { FURNITURE, type LayoutPart } from '@office/shared'
import { Swivel, sitting } from './chairs'

/** Every placed catalogue part, drawn instanced: one draw call per mesh of each distinct part,
 * however many times it is placed. Task chairs swivel with whoever sits in them (chairs.ts). */

const SWIVELS = (id: string) => id.startsWith('seating.task-chair')
/** A part's chair turns: the angles, and a counter bumped whenever they change. */
type Turns = { swivel: Swivel; angles: Float32Array; version: { current: number } }

const modelUrl = (id: string) => `/assets/models/catalogue/${id}.glb`

const BY_PART = (() => {
  const groups = new Map<string, LayoutPart[]>()
  for (const p of FURNITURE) groups.set(p.part, [...(groups.get(p.part) ?? []), p])
  return groups
})()

function MeshInstances({ mesh, placements, turns }: { mesh: THREE.Mesh; placements: LayoutPart[]; turns?: Turns }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const applied = useRef(-1)
  const transparent = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some((m) => m.transparent)
  const write = useCallback(() => {
    const instanced = ref.current
    if (!instanced) return
    const place = new THREE.Matrix4()
    const turn = new THREE.Quaternion()
    const out = new THREE.Matrix4()
    const up = new THREE.Vector3(0, 1, 0)
    const one = new THREE.Vector3(1, 1, 1)
    const at = new THREE.Vector3()
    placements.forEach((p, i) => {
      turn.setFromAxisAngle(up, turns ? turns.angles[i] : (p.rotY * Math.PI) / 180)
      place.compose(at.set(p.x, p.y, p.z), turn, one)
      instanced.setMatrixAt(i, out.multiplyMatrices(place, mesh.matrixWorld))
    })
    instanced.instanceMatrix.needsUpdate = true
  }, [mesh, placements, turns])
  useLayoutEffect(() => {
    write()
    ref.current?.computeBoundingSphere()
  }, [write])
  useFrame(() => {
    if (!turns || turns.version.current === applied.current) return
    applied.current = turns.version.current
    write()
  })
  return (
    <instancedMesh ref={ref} args={[mesh.geometry, mesh.material, placements.length]}
      castShadow={!transparent} receiveShadow />
  )
}

function PartInstances({ id, placements }: { id: string; placements: LayoutPart[] }) {
  const { scene } = useGLTF(modelUrl(id))
  const meshes = useMemo(() => {
    scene.updateMatrixWorld(true)
    const found: THREE.Mesh[] = []
    scene.traverse((o) => { if (o instanceof THREE.Mesh) found.push(o) })
    return found
  }, [scene])
  const turns = useMemo<Turns | undefined>(() => {
    if (!SWIVELS(id)) return undefined
    const swivel = new Swivel(placements)
    return { swivel, angles: swivel.angles, version: { current: 0 } }
  }, [id, placements])
  useFrame((_, dt) => {
    if (turns?.swivel.update(Math.min(dt, 0.1), sitting.values())) turns.version.current += 1
  })
  return <>{meshes.map((m, i) => <MeshInstances key={i} mesh={m} placements={placements} turns={turns} />)}</>
}

export default function Furniture() {
  return <group>{[...BY_PART].map(([id, placements]) => <PartInstances key={id} id={id} placements={placements} />)}</group>
}

for (const id of BY_PART.keys()) useGLTF.preload(modelUrl(id))
