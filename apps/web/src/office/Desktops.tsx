import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { WORLD } from '@office/shared'

/**
 * A keyboard, mouse and felt desk mat lying flat at every desk place (WORLD.desktops), turned to
 * the person, mouse on their right. Real geometry rather than cut-outs: a flat object drawn as an
 * upright picture only reads right one way round, and half the desks face the other way.
 */

const DESK_TOP = 0.75

function keyTexture() {
  const [w, h] = [512, 160]
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')!
  g.fillStyle = '#2b2e33'
  g.fillRect(0, 0, w, h)
  const rows = [14, 14, 13, 12, 9]
  rows.forEach((n, r) => {
    const keyW = (w - 16) / 14.5, y = 8 + r * ((h - 16) / rows.length)
    let x = 8 + (r === 4 ? keyW * 2.5 : r * keyW * 0.25)
    for (let i = 0; i < n; i++) {
      const kw = r === 4 && i === 4 ? keyW * 5 : keyW
      g.fillStyle = '#4a4e55'
      g.fillRect(x + 2, y + 2, kw - 4, (h - 16) / rows.length - 4)
      g.fillStyle = 'rgba(255,255,255,0.08)'
      g.fillRect(x + 2, y + 2, kw - 4, 3)
      x += kw
    }
  })
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

export default function Desktops() {
  const mats = useRef<THREE.InstancedMesh>(null)
  const keyboards = useRef<THREE.InstancedMesh>(null)
  const mice = useRef<THREE.InstancedMesh>(null)
  const parts = useMemo(() => {
    const keys = keyTexture()
    const plain = new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.6 })
    return {
      mat: new THREE.BoxGeometry(0.8, 0.004, 0.32).translate(0, 0.002, 0),
      matMaterial: new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.95 }),
      keyboard: new RoundedBoxGeometry(0.44, 0.022, 0.14, 2, 0.006).translate(-0.05, 0.004 + 0.011, 0),
      // top face shows the keys, the rest is plain dark plastic (BoxGeometry face order: +x, -x, +y, -y, +z, -z)
      keyboardMaterial: [plain, plain, new THREE.MeshStandardMaterial({ map: keys, roughness: 0.55 }), plain, plain, plain],
      mouse: new THREE.SphereGeometry(1, 16, 10).scale(0.032, 0.018, 0.055).translate(0.28, 0.004 + 0.012, 0.01),
      mouseMaterial: new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.4 }),
    }
  }, [])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1)
    for (const mesh of [mats.current, keyboards.current, mice.current]) {
      if (!mesh) continue
      WORLD.desktops.forEach((d, i) => {
        q.setFromAxisAngle(up, (d.rotY * Math.PI) / 180)
        mesh.setMatrixAt(i, m.compose(new THREE.Vector3(d.x, DESK_TOP, d.z), q, one))
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [])
  const n = WORLD.desktops.length
  return (
    <group>
      <instancedMesh ref={mats} args={[parts.mat, parts.matMaterial, n]} receiveShadow />
      <instancedMesh ref={keyboards} args={[parts.keyboard, parts.keyboardMaterial, n]} />
      <instancedMesh ref={mice} args={[parts.mouse, parts.mouseMaterial, n]} />
    </group>
  )
}
