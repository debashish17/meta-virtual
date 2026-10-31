import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Suspense, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'

/**
 * Look-dev stage for kit parts and layouts: the office's fixed orthographic view direction,
 * warm key light with soft shadows, sky/ground fill, contact shadows and N8AO ambient occlusion,
 * on the kit board's neutral grey. The camera never orbits; it only re-fits to the content.
 */

const BACKGROUND = '#dcdcdc'   // shows as the kit board's #d6d6d6 after tone mapping
const VIEW = new THREE.Vector3(-1, 1, 1).normalize()   // the office camera: true isometric from the south-west
const KEY_FROM = new THREE.Vector3(0.75, 1.6, 0.3).normalize()   // the office's east-south-east daylight, high
const MARGIN = 0.8

type Fit = { center: THREE.Vector3; size: THREE.Vector3; radius: number }

function fitCamera(camera: THREE.OrthographicCamera, box: THREE.Box3, view: { width: number; height: number }) {
  const center = box.getCenter(new THREE.Vector3())
  camera.position.copy(center).addScaledVector(VIEW, 60)
  camera.lookAt(center)
  camera.updateMatrixWorld()
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
  let [minU, maxU, minV, maxV] = [Infinity, -Infinity, Infinity, -Infinity]
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const p = new THREE.Vector3(x, y, z).sub(center)
    const u = p.dot(right)
    const v = p.dot(up)
    ;[minU, maxU, minV, maxV] = [Math.min(minU, u), Math.max(maxU, u), Math.min(minV, v), Math.max(maxV, v)]
  }
  camera.position.addScaledVector(right, (minU + maxU) / 2).addScaledVector(up, (minV + maxV) / 2)
  camera.zoom = MARGIN * Math.min(view.width / (maxU - minU), view.height / (maxV - minV))
  camera.updateProjectionMatrix()
  return camera.zoom
}

function KeyLight({ fit }: { fit: Fit }) {
  const light = useRef<THREE.DirectionalLight>(null)
  useLayoutEffect(() => {
    const l = light.current
    if (!l) return
    l.position.copy(fit.center).addScaledVector(KEY_FROM, fit.radius * 4)
    l.target.position.copy(fit.center)
    l.target.updateMatrixWorld()
    const cam = l.shadow.camera
    const r = fit.radius * 1.6
    ;[cam.left, cam.right, cam.top, cam.bottom, cam.near, cam.far] = [-r, r, r, -r, 0.1, fit.radius * 8]
    cam.updateProjectionMatrix()
    l.shadow.needsUpdate = true
  }, [fit])
  return (
    <directionalLight ref={light} color="#fff3e6" intensity={2.0} castShadow
      shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02} shadow-radius={6} />
  )
}

function Ground({ fit }: { fit: Fit }) {
  const span = Math.max(fit.size.x, fit.size.z)
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[fit.center.x, 0, fit.center.z]} receiveShadow>
        <planeGeometry args={[span * 6 + 4, span * 6 + 4]} />
        <shadowMaterial transparent opacity={0.14} />
      </mesh>
      <ContactShadows position={[fit.center.x, 0.002, fit.center.z]} scale={span * 1.6 + 1}
        resolution={1024} blur={2.2} far={Math.max(0.8, fit.size.y)} opacity={0.42} color="#3b3328" />
    </>
  )
}

function Content({ children, onZoom }: { children: ReactNode; onZoom: (pxPerM: number) => void }) {
  const group = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const size = useThree((s) => s.size)
  const [fit, setFit] = useState<Fit | null>(null)

  useLayoutEffect(() => {
    if (!group.current) return
    const box = new THREE.Box3().setFromObject(group.current)
    if (box.isEmpty()) return
    const s = box.getSize(new THREE.Vector3())
    setFit({ center: box.getCenter(new THREE.Vector3()), size: s, radius: Math.max(0.5, s.length() / 2) })
    onZoom(fitCamera(camera, box, size))
  }, [camera, size, onZoom])

  return (
    <>
      <group ref={group}>{children}</group>
      {fit && <KeyLight fit={fit} />}
      {fit && <Ground fit={fit} />}
    </>
  )
}

export default function Stage({ children, contentKey, onZoom }: { children: ReactNode; contentKey: string; onZoom: (pxPerM: number) => void }) {
  return (
    <Canvas shadows="soft" orthographic dpr={[1, 2]}
      camera={{ position: [-20, 20, 20], zoom: 100, near: 0.1, far: 200 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}>
      <color attach="background" args={[BACKGROUND]} />
      <hemisphereLight args={['#fbf7f1', '#cdc7bd', 0.9]} />
      <directionalLight color="#e4ecf5" intensity={0.55} position={[8, 4, -2]} />
      <Environment resolution={128} frames={1} environmentIntensity={1.0}>
        {/* a grey surround, so metals reflect a room rather than black between the light panels */}
        <color attach="background" args={['#9a9894']} />
        <Lightformer form="rect" intensity={1.6} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer form="rect" intensity={0.9} position={[-6, 2, 4]} rotation-y={Math.PI / 3} scale={[6, 4, 1]} color="#fff1e0" />
        <Lightformer form="rect" intensity={0.5} position={[6, 2, -3]} rotation-y={-Math.PI / 2} scale={[6, 4, 1]} />
      </Environment>
      <Suspense fallback={null}>
        <Content key={contentKey} onZoom={onZoom}>{children}</Content>
      </Suspense>
      <EffectComposer multisampling={4}>
        <N8AO aoRadius={0.35} distanceFalloff={0.6} intensity={2.2} quality="high" color="#2c261f" />
        {/* The composer renders linear HDR and skips the renderer's tone mapping, so apply it here. */}
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      </EffectComposer>
    </Canvas>
  )
}
