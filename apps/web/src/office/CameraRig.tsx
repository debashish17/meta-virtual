import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect } from 'react'
import * as THREE from 'three'
import { WORLD } from '@office/shared'
import { useMe } from './me'
import { VIEW_DIR } from './palette'
import { avatar, OVERVIEW, view } from './state'

/**
 * The camera never turns: true isometric from the south-west (DESIGN_SPEC 2). In the walking view
 * it eases after the avatar at a close zoom that the mouse wheel can change within limits; with
 * ?view=overview it frames the whole floor instead.
 */

const ZOOM_RANGE: [number, number] = [34, 120]   // pixels per metre
const FOLLOW = 5                                   // 1/s, how quickly the view catches up
// The view's target stays this far inside the floor's open south and west edges (and a little
// inside the north and east walls), so walking along an edge does not fill the screen with void.
const KEEP_IN = { west: 6, east: 2.5, north: 2, south: 6 }
const EDITOR_PX = 332                              // the look editor's width and margin (office.css)
const SCREEN_RIGHT = new THREE.Vector3(1, 0, 1).normalize()   // screen right on the floor, for the south-west camera

function place(camera: THREE.OrthographicCamera, x: number, z: number) {
  camera.position.set(x, 0, z).addScaledVector(VIEW_DIR, 80)
  camera.lookAt(x, 0, z)
}

function fitFloor(camera: THREE.OrthographicCamera, size: { width: number; height: number }) {
  const centre = new THREE.Vector3(WORLD.width / 2, 0, WORLD.depth / 2)
  place(camera, centre.x, centre.z)
  camera.updateMatrixWorld()
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
  let [minU, maxU, minV, maxV] = [Infinity, -Infinity, Infinity, -Infinity]
  for (const x of [0, WORLD.width]) for (const y of [0, WORLD.wallHeight]) for (const z of [0, WORLD.depth]) {
    const p = new THREE.Vector3(x, y, z).sub(centre)
    ;[minU, maxU] = [Math.min(minU, p.dot(right)), Math.max(maxU, p.dot(right))]
    ;[minV, maxV] = [Math.min(minV, p.dot(up)), Math.max(maxV, p.dot(up))]
  }
  camera.position.addScaledVector(right, (minU + maxU) / 2).addScaledVector(up, (minV + maxV) / 2)
  camera.zoom = 0.95 * Math.min(size.width / (maxU - minU), size.height / (maxV - minV))
}

export default function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const size = useThree((s) => s.size)
  const dom = useThree((s) => s.gl.domElement)

  useLayoutEffect(() => {
    camera.near = 0.1
    camera.far = 300
    if (OVERVIEW) fitFloor(camera, size)
    else {
      view.x = THREE.MathUtils.clamp(avatar.x, KEEP_IN.west, WORLD.width - KEEP_IN.east)
      view.z = THREE.MathUtils.clamp(avatar.z, KEEP_IN.north, WORLD.depth - KEEP_IN.south)
      place(camera, view.x, view.z)
      camera.zoom = view.zoom
    }
    camera.updateProjectionMatrix()
  }, [camera, size])

  useEffect(() => {
    if (OVERVIEW) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      view.zoom = THREE.MathUtils.clamp(view.zoom * Math.exp(-e.deltaY * 0.0015), ...ZOOM_RANGE)
    }
    dom.addEventListener('wheel', wheel, { passive: false })
    return () => dom.removeEventListener('wheel', wheel)
  }, [dom])

  useFrame((_, dt) => {
    if (OVERVIEW) return
    const k = 1 - Math.exp(-FOLLOW * Math.min(dt, 0.1))
    let tx = THREE.MathUtils.clamp(avatar.x, KEEP_IN.west, WORLD.width - KEEP_IN.east)
    let tz = THREE.MathUtils.clamp(avatar.z, KEEP_IN.north, WORLD.depth - KEEP_IN.south)
    if (useMe.getState().editing) {
      // frame the avatar itself, half a panel left of centre so the look editor does not cover it
      const shift = EDITOR_PX / 2 / camera.zoom
      tx = avatar.x + SCREEN_RIGHT.x * shift
      tz = avatar.z + SCREEN_RIGHT.z * shift
    }
    view.x += (tx - view.x) * k
    view.z += (tz - view.z) * k
    place(camera, view.x, view.z)
    if (Math.abs(camera.zoom - view.zoom) > 0.01) {
      camera.zoom += (view.zoom - camera.zoom) * Math.min(1, dt * 10)
      camera.updateProjectionMatrix()
    }
  })
  return null
}
