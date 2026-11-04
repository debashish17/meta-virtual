import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { BrightnessContrast, EffectComposer, HueSaturation, N8AO, TiltShift2, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Suspense, useRef } from 'react'
import LoadingScreen from './LoadingScreen'
import { useLoading } from './loading'
import Architecture from './Architecture'
import Avatar, { hoverAt, walkTo } from './Avatar'
import CameraRig from './CameraRig'
import Furniture from './Furniture'
import Hud from './Hud'
import Lighting, { refreshShadows } from './Lighting'
import Cityscape from './Cityscape'
import Colleagues from './Colleagues'
import Desktops from './Desktops'
import Pedestrians from './Pedestrians'
import Sprites from './Sprites'
import LiveShare from './displays/LiveShare'
import WallDisplays from './displays/WallDisplays'
import BoardTexture from '../board/BoardTexture'
import Players from '../net/Players'
import Panels from '../ui/Panels'
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

/** Lifts the loading screen once the floor has rendered, then sets window.__officeReady (used by the
 * screenshot script and the e2e specs) once the screen is gone, so neither ever catches it fading. */
function ReadySignal() {
  const frames = useRef(0)
  const ready = useRef(false)
  const gl = useThree((s) => s.gl)
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__officeGl = gl   // renderer stats for profiling
  useFrame(() => {
    frames.current += 1
    if (frames.current === 2) refreshShadows()   // furniture has just mounted
    if (frames.current === 3) useLoading.setState({ shown: true })   // the floor is drawn: fade the loading screen
    // Ready after 20 frames and the loading screen's fade (a cap keeps it from ever waiting forever).
    if (!ready.current && frames.current >= 20 && (useLoading.getState().gone || frames.current >= 300)) {
      ready.current = true;
      (window as unknown as { __officeReady?: boolean }).__officeReady = true
    }
  })
  return null
}

export default function OfficeScene() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: PALETTE.background }}>
      {/* isolation: the name pills (drei Html, z-index up to 20) stay inside the scene's own
          stacking layer, under the panels and the HUD, which come after it */}
      <Canvas orthographic shadows={SHADOWS ? 'soft' : false} dpr={[1, 2]} gl={{ antialias: false, powerPreference: 'high-performance' }}
        camera={{ position: [0, 50, 0], zoom: 60 }} style={{ isolation: 'isolate' }}>
        <color attach="background" args={[PALETTE.background]} />
        <CameraRig />
        <Lighting />
        <Suspense fallback={null}>
          <Architecture onPick={OVERVIEW ? undefined : (p) => walkTo({ x: p.x, z: p.z })}
            onHover={OVERVIEW ? undefined : (p) => hoverAt(p && { x: p.x, z: p.z })} />
          <Furniture />
          <Desktops />
          <Sprites />
          <Cityscape />
          {!OVERVIEW && <Avatar />}
          <Colleagues />
          <Players />
          <WallDisplays />
          <BoardTexture />
          <LiveShare />
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
      <Panels />
      <LoadingScreen />
    </div>
  )
}
