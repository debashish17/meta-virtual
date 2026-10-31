import { useTexture } from '@react-three/drei'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { SPRITE_IMAGES, SPRITES, type SpriteProp } from '@office/shared'
import { ELEVATION, SPRITE_YAW } from './palette'

/**
 * Reference crops placed straight into the scene as upright cut-outs, instanced per image. The
 * camera never turns, so a picture already drawn in isometric reads as the object. Each stands on
 * its base point turned to the camera, stretched by 1/cos(elevation) so it shows at the crop's own
 * proportions. Crops are drawn from the front-right, so south-facing props are mirrored.
 */

const BY_REF = (() => {
  const groups = new Map<string, SpriteProp[]>()
  for (const s of SPRITES) groups.set(s.ref, [...(groups.get(s.ref) ?? []), s])
  return groups
})()
const REFS = [...BY_REF.keys()]
const PLANE = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)   // origin at the bottom edge

function RefInstances({ refId, map }: { refId: string; map: THREE.Texture }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const props = BY_REF.get(refId)!
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, toneMapped: false }), [map])
  useLayoutEffect(() => {
    const instanced = ref.current
    if (!instanced) return
    const [pxW, pxH] = SPRITE_IMAGES[refId].px
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), SPRITE_YAW)
    const m = new THREE.Matrix4()
    props.forEach((p, i) => {
      const height = (p.width * pxH) / pxW / Math.cos(ELEVATION)
      m.compose(new THREE.Vector3(p.x, p.y, p.z), turn, new THREE.Vector3(p.facing === 'south' ? -p.width : p.width, height, 1))
      instanced.setMatrixAt(i, m)
    })
    instanced.instanceMatrix.needsUpdate = true
    instanced.computeBoundingSphere()
  }, [refId, props])
  return <instancedMesh ref={ref} args={[PLANE, material, props.length]} />
}

export default function Sprites() {
  const textures = useTexture(REFS.map((r) => SPRITE_IMAGES[r].url))
  useMemo(() => textures.forEach((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4 }), [textures])
  return <group>{REFS.map((r, i) => <RefInstances key={r} refId={r} map={textures[i]} />)}</group>
}
