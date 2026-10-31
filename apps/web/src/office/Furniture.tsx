import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { FURNITURE, type LayoutPart } from '@office/shared'

/** Every placed catalogue part, drawn instanced: one draw call per mesh of each distinct part,
 * however many times it is placed. */

const modelUrl = (id: string) => `/assets/models/catalogue/${id}.glb`

const BY_PART = (() => {
  const groups = new Map<string, LayoutPart[]>()
  for (const p of FURNITURE) groups.set(p.part, [...(groups.get(p.part) ?? []), p])
  return groups
})()

function MeshInstances({ mesh, placements }: { mesh: THREE.Mesh; placements: LayoutPart[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const transparent = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some((m) => m.transparent)
  useLayoutEffect(() => {
    const instanced = ref.current
    if (!instanced) return
    const place = new THREE.Matrix4()
    const turn = new THREE.Quaternion()
    const out = new THREE.Matrix4()
    placements.forEach((p, i) => {
      turn.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (p.rotY * Math.PI) / 180)
      place.compose(new THREE.Vector3(p.x, p.y, p.z), turn, new THREE.Vector3(1, 1, 1))
      instanced.setMatrixAt(i, out.multiplyMatrices(place, mesh.matrixWorld))
    })
    instanced.instanceMatrix.needsUpdate = true
    instanced.computeBoundingSphere()
  }, [mesh, placements])
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
  return <>{meshes.map((m, i) => <MeshInstances key={i} mesh={m} placements={placements} />)}</>
}

export default function Furniture() {
  return <group>{[...BY_PART].map(([id, placements]) => <PartInstances key={id} id={id} placements={placements} />)}</group>
}

for (const id of BY_PART.keys()) useGLTF.preload(modelUrl(id))
