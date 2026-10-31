import { Clone, useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import type { Layout } from '@office/shared'
import { BUILD } from './data'

type Placement = { position?: [number, number, number]; rotationY?: number }

function Model({ url, position, rotationY = 0 }: { url: string } & Placement) {
  const { scene } = useGLTF(url)
  useMemo(() => {
    // Glass and other see-through surfaces should not throw solid shadows.
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      const materials = Array.isArray(o.material) ? o.material : [o.material]
      o.castShadow = !materials.some((m) => m.transparent)
      o.receiveShadow = true
    })
  }, [scene])
  return <Clone object={scene} position={position} rotation={[0, rotationY, 0]} />
}

/** A built catalogue part at its GLB origin (floor centre of its footprint). */
export function PartModel({ id, ...placement }: { id: string } & Placement) {
  const build = BUILD.get(id)
  return build ? <Model url={build.model} {...placement} /> : null
}

/** A composite laid out from built parts (packages/shared/src/layouts). */
export function LayoutModel({ layout }: { layout: Layout }) {
  return (
    <group>
      {layout.parts.map((p, i) => (
        <PartModel key={i} id={p.part} position={[p.x, p.y, p.z]} rotationY={(p.rotY * Math.PI) / 180} />
      ))}
    </group>
  )
}
