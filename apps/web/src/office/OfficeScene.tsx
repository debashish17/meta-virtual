import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { BrightnessContrast, EffectComposer, HueSaturation, N8AO, TiltShift2, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Suspense, useRef } from 'react'
import Architecture from './Architecture'
import Avatar, { walkTo } from './Avatar'
import CameraRig from './CameraRig'
import Furniture from './Furniture'
import Hud from './Hud'
import Lighting, { refreshShadows } from './Lighting'
import Cityscape from './Cityscape'
import Colleagues from './Colleagues'
import Desktops from './Desktops'
import Pedestrians from './Pedestrians'
import Sprites from './Sprites'
import { PALETTE } from './palette'
import { OVERVIEW } from './state'

/**
 * The office, the app's page (`?view=overview` frames the whole floor). The camera follows the
 * local avatar at a walking zoom. Ambient occlusion and daylight through the windows give the
 * interior depth; the composer applies tone mapping (it renders in linear HDR), a light grade and
 * a soft vignette; the overview adds a gentle tilt-shift so the eye settles on the office. (The
 * walking view stays sharp: people need to read it.)
 */

const PARAMS = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
// dev profiling switches: &noao, &noshadow
const AO = !(import.meta.env.DEV && PARAMS.has('noao'))
const SHADOWS = !(import.meta.env.DEV && PARAMS.has('noshadow'))

/** Sets window.__officeReady a few frames after everything has loaded (used by the screenshot script). */
function ReadySignal() {
  const frames = useRef(0)
  const gl = useThree((s) => s.gl)
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__officeGl = gl   // renderer stats for profiling
  useFrame(() => {
    frames.current += 1
    if (frames.current === 2) refreshShadows()   // furniture has just mounted
    if (frames.current === 20) (window as unknown as { __officeReady?: boolean }).__officeReady = true
  })
  return null
}

export default function OfficeScene() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: PALETTE.background }}>
      <Canvas orthographic shadows={SHADOWS ? 'soft' : false} dpr={[1, 2]} gl={{ antialias: false, powerPreference: 'high-performance' }}
        camera={{ position: [0, 50, 0], zoom: 60 }}>
        <color attach="background" args={[PALETTE.background]} />
        <CameraRig />
        <Lighting />
        <Suspense fallback={null}>
          <Architecture onPick={OVERVIEW ? undefined : (p) => walkTo({ x: p.x, z: p.z })} />
          <Furniture />
          <Desktops />
          <Sprites />
          <Cityscape />
          {!OVERVIEW && <Avatar />}
          <Colleagues />
          <Pedestrians />
          <ReadySignal />
        </Suspense>
        <EffectComposer multisampling={4}>
          {[
            AO && <N8AO key="ao" aoRadius={0.8} distanceFalloff={0.8} intensity={3.4} quality="medium" halfRes color="#1e2a3a" />,
            <ToneMapping key="tone" mode={ToneMappingMode.NEUTRAL} />,
            <HueSaturation key="sat" saturation={0.04} />,
            <BrightnessContrast key="contrast" contrast={0.06} />,
            OVERVIEW && <TiltShift2 key="tilt" blur={0.08} taper={0.6} start={[0.0, 0.5]} end={[1.0, 0.5]} samples={10} />,
            <Vignette key="vignette" offset={0.3} darkness={0.3} />,
          ].filter((e) => e !== false)}
        </EffectComposer>
      </Canvas>
      <Hud />
    </div>
  )
}
