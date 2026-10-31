import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { WORLD } from '@office/shared'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { OVERVIEW, view } from './state'

/**
 * Daylight through the east windows. A warm sun sits south-east, 38 degrees up, so the south faces
 * the camera sees are lit and the west faces stay in shade; with the ceiling casting shadows
 * (Architecture's ShadowShell) its light lands only in patches inside the glass, striped by the
 * mullions, and a faint shaft is drawn from each bay to its patch. A cool sky hemisphere, a soft
 * room environment and a weak cool light from the north-west fill the shade, so shadows take the
 * sky's colour instead of going grey.
 */

const ELEVATION = (38 * Math.PI) / 180
const AZIMUTH = (30 * Math.PI) / 180   // from +x (east) towards +z (south)
export const SUN_DIR = new THREE.Vector3(Math.cos(ELEVATION) * Math.cos(AZIMUTH), Math.sin(ELEVATION),
  Math.cos(ELEVATION) * Math.sin(AZIMUTH))
const SHADOW_HALF = 28                  // metres covered either side of the camera's target
const SHADOW_MAP = 4096
// Everything that casts sun shadows is static, so the shadow map is drawn only when the frustum
// moves to a new 2 m step (or when asked, e.g. once the furniture has loaded), not every frame.
const SHADOW_STEP = 2
const shadow = { dirty: true }
export const refreshShadows = () => { shadow.dirty = true }

function Sun() {
  const light = useRef<THREE.DirectionalLight>(null)
  const gl = useThree((s) => s.gl)
  const at = useRef({ x: NaN, z: NaN })
  useLayoutEffect(() => {
    gl.shadowMap.autoUpdate = false
    const cam = light.current!.shadow.camera
    const half = OVERVIEW ? 40 : SHADOW_HALF
    ;[cam.left, cam.right, cam.top, cam.bottom, cam.near, cam.far] = [-half, half, half, -half, 1, 120]
    cam.updateProjectionMatrix()
  }, [gl])
  useFrame(() => {
    const l = light.current
    if (!l) return
    const tx = OVERVIEW ? WORLD.width / 2 : Math.round(view.x / SHADOW_STEP) * SHADOW_STEP
    const tz = OVERVIEW ? WORLD.depth / 2 : Math.round(view.z / SHADOW_STEP) * SHADOW_STEP
    if (tx !== at.current.x || tz !== at.current.z) {
      at.current = { x: tx, z: tz }
      l.target.position.set(tx, 0, tz)
      l.position.set(tx + SUN_DIR.x * 50, SUN_DIR.y * 50, tz + SUN_DIR.z * 50)
      l.target.updateMatrixWorld()
      shadow.dirty = true
    }
    if (shadow.dirty) {
      gl.shadowMap.needsUpdate = true
      shadow.dirty = false
    }
  })
  return (
    <directionalLight ref={light} color="#ffe2bc" intensity={3.2} castShadow
      shadow-mapSize={[SHADOW_MAP, SHADOW_MAP]} shadow-bias={-0.0002} shadow-normalBias={0.025} shadow-radius={3} />
  )
}

/** Shafts: one translucent sheet per window bay, from the head of the glass to where its light
 * lands, fading towards the floor. */
function Shafts() {
  const { geometry, material } = useMemo(() => {
    const { x, from, to, mullionEvery } = WORLD.window
    const top = WORLD.wallHeight - 0.12
    const reach = SUN_DIR.clone().multiplyScalar(-top / SUN_DIR.y)    // window head -> floor
    const positions: number[] = [], alphas: number[] = []
    for (let z = from; z < to - 1e-6; z += mullionEvery) {
      const [z0, z1] = [z + 0.06, z + mullionEvery - 0.06]
      const a = [x, top, z0], b = [x, top, z1]
      const c = [x + reach.x, 0.02, z1 + reach.z], d = [x + reach.x, 0.02, z0 + reach.z]
      positions.push(...a, ...b, ...c, ...a, ...c, ...d)
      alphas.push(1, 1, 0, 1, 0, 0)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('shaft', new THREE.Float32BufferAttribute(alphas, 1))
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { tint: { value: new THREE.Color('#ffe7c2') }, strength: { value: 0.2 } },
      vertexShader: 'attribute float shaft; varying float vShaft; void main() { vShaft = shaft; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 tint; uniform float strength; varying float vShaft; void main() { gl_FragColor = vec4(tint * strength * vShaft * vShaft, 1.0); }',
    })
    return { geometry: g, material: m }
  }, [])
  return <mesh geometry={geometry} material={material} renderOrder={5} />
}

const HEMISPHERE = 1.45

/** A soft studio environment for glass, cars and the shaded sides (no network: three's RoomEnvironment). */
function Environment() {
  const { gl, scene } = useThree()
  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.35
    return () => { scene.environment = null; env.dispose(); pmrem.dispose() }
  }, [gl, scene])
  return null
}

export default function Lighting() {
  return (
    <>
      <hemisphereLight args={['#dde3ea', '#d2c6b1', HEMISPHERE]} />
      <directionalLight color="#dce6f5" intensity={0.35} position={[-30, 40, -30]} />   {/* cool fill from the north-west, no shadows */}
      <Environment />
      <Sun />
      <Shafts />
    </>
  )
}
