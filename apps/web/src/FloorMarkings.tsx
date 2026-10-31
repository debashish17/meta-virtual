import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Point } from './world'

// Helper to create sharp architectural floor typography using CanvasTexture
function createFloorStencilTexture(
  primaryText: string,
  subText: string = '',
  accentColor: string = '#4c5d6e',
  textColor: string = '#ffffff'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.CanvasTexture(canvas)

  // Clear transparent
  ctx.clearRect(0, 0, 1024, 256)

  // Accent badge bar
  ctx.fillStyle = accentColor
  ctx.beginPath()
  ctx.roundRect(16, 24, 24, 208, 12)
  ctx.fill()

  // Primary title text (Architectural sans-serif)
  ctx.fillStyle = textColor
  ctx.font = '900 68px "Inter", "Segoe UI", system-ui, sans-serif'
  ctx.letterSpacing = '5px'
  ctx.fillText(primaryText.toUpperCase(), 64, 116)

  // Subtext / Metadata code
  if (subText) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)'
    ctx.font = '600 36px "JetBrains Mono", "Courier New", monospace'
    ctx.letterSpacing = '3px'
    ctx.fillText(subText.toUpperCase(), 66, 178)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}

// Interactive Animated Destination Beacon Ring
export function DestinationBeacon({ targetPoint }: { targetPoint: Point | null }) {
  const ringRef = useRef<THREE.Mesh>(null)
  const pulseRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (!ringRef.current || !pulseRef.current) return
    const t = clock.getElapsedTime()
    // Smooth pulsation
    const scale = 1 + Math.sin(t * 5) * 0.12
    ringRef.current.scale.set(scale, scale, 1)

    // Expanding outer shockwave ripple
    const wave = (t * 2.2) % 1
    pulseRef.current.scale.set(1 + wave * 1.4, 1 + wave * 1.4, 1)
    const mat = pulseRef.current.material as THREE.MeshBasicMaterial
    if (mat) mat.opacity = Math.max(0, (1 - wave) * 0.5)
  })

  if (!targetPoint) return null

  return (
    <group position={[targetPoint[0], 0.02, targetPoint[1]]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Outer pulsing ring */}
      <mesh ref={pulseRef}>
        <ringGeometry args={[0.26, 0.32, 32]} />
        <meshBasicMaterial color="#e59838" transparent opacity={0.5} />
      </mesh>
      {/* Center solid ring */}
      <mesh ref={ringRef}>
        <ringGeometry args={[0.18, 0.24, 32]} />
        <meshBasicMaterial color="#e59838" transparent opacity={0.9} />
      </mesh>
      {/* Center pinpoint */}
      <mesh>
        <circleGeometry args={[0.07, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.95} />
      </mesh>
      {/* 4 Crosshairs */}
      {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle, i) => (
        <mesh key={i} rotation={[0, 0, angle]} position={[0, 0, 0]}>
          <planeGeometry args={[0.04, 0.16]} />
          <meshBasicMaterial color="#e59838" transparent opacity={0.8} />
        </mesh>
      ))}
    </group>
  )
}

// Complete Floor Markings, Zone Rugs, Circulation Lanes & Boundary Stencils
export function FloorMarkings({ targetPoint }: { targetPoint?: Point | null }) {
  // Stencil textures
  const customerStencil = useMemo(
    () => createFloorStencilTexture('Customer Lab', 'Zone A1 // Acme Corp', '#e59838', '#ffffff'),
    []
  )
  const projectStencil = useMemo(
    () => createFloorStencilTexture('Sprint Lab', 'Zone B2 // Meta-Virtual', '#4ca5b8', '#ffffff'),
    []
  )
  const workstationStencil = useMemo(
    () => createFloorStencilTexture('Collab Pod', 'Desk Cluster 01-06', '#598e72', '#ffffff'),
    []
  )
  const loungeStencil = useMemo(
    () => createFloorStencilTexture('Lounge Area', 'Breakout & Informal', '#9673aa', '#ffffff'),
    []
  )
  const pantryStencil = useMemo(
    () => createFloorStencilTexture('Pantry & Cafe', 'Kitchen Bay', '#b08259', '#ffffff'),
    []
  )

  return (
    <group position={[0, 0, 0]}>
      {/* ============================================================== */}
      {/* 1. CONCRETE SLAB EXPANSION JOINTS (Hairline Floor Grid)        */}
      {/* ============================================================== */}
      {/* Longitudinal expansion cuts every 2m */}
      {[2, 4, 6, 8, 10].map((x) => (
        <mesh key={`grid-x-${x}`} position={[x, 0.001, 5]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.02, 10]} />
          <meshBasicMaterial color="#c2c0b8" transparent opacity={0.65} />
        </mesh>
      ))}
      {/* Latitudinal expansion cuts every 2m */}
      {[2, 4, 6, 8].map((z) => (
        <mesh key={`grid-z-${z}`} position={[6, 0.001, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[12, 0.02]} />
          <meshBasicMaterial color="#c2c0b8" transparent opacity={0.65} />
        </mesh>
      ))}

      {/* ============================================================== */}
      {/* 2. ZONE RUGS & INLAYS (Architectural Flooring Accents)         */}
      {/* ============================================================== */}

      {/* ZONE A: Customer Room / Executive Boardroom Rug */}
      <group position={[9.9, 0.003, 1.8]}>
        {/* Border Binding */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[3.48, 2.78]} />
          <meshStandardMaterial color="#262f38" roughness={0.9} />
        </mesh>
        {/* Inner Slate Carpet Plate */}
        <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[3.36, 2.66]} />
          <meshStandardMaterial color="#2e3843" roughness={0.82} />
        </mesh>
        {/* Grid pattern stitching lines on carpet */}
        {[-0.8, 0, 0.8].map((ox) => (
          <mesh key={ox} position={[ox, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.015, 2.6]} />
            <meshBasicMaterial color="#3a4755" />
          </mesh>
        ))}
        {/* Gold Accent Corner Markers */}
        {[
          [-1.6, -1.25],
          [1.6, -1.25],
          [-1.6, 1.25],
          [1.6, 1.25],
        ].map(([cx, cz], i) => (
          <mesh key={i} position={[cx, 0.003, cz]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.14, 0.14]} />
            <meshBasicMaterial color="#e59838" />
          </mesh>
        ))}
        {/* Floor Typography Stencil */}
        <mesh position={[-0.45, 0.004, 1.05]} rotation={[-Math.PI / 2, 0, Math.PI]}>
          <planeGeometry args={[2.0, 0.5]} />
          <meshBasicMaterial map={customerStencil} transparent opacity={0.95} />
        </mesh>
      </group>

      {/* ZONE B: Project Room / Sprint Lab Carpet */}
      <group position={[9.9, 0.003, 5.2]}>
        {/* Border Trim */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[3.48, 3.18]} />
          <meshStandardMaterial color="#2c3035" roughness={0.9} />
        </mesh>
        {/* Inner Charcoal Carpet */}
        <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[3.36, 3.06]} />
          <meshStandardMaterial color="#353b42" roughness={0.84} />
        </mesh>
        {/* Cyan Accent Corner Markers */}
        {[
          [-1.6, -1.45],
          [1.6, -1.45],
          [-1.6, 1.45],
          [1.6, 1.45],
        ].map(([cx, cz], i) => (
          <mesh key={i} position={[cx, 0.003, cz]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.14, 0.14]} />
            <meshBasicMaterial color="#4ca5b8" />
          </mesh>
        ))}
        {/* Floor Stencil */}
        <mesh position={[-0.45, 0.004, 1.2]} rotation={[-Math.PI / 2, 0, Math.PI]}>
          <planeGeometry args={[2.0, 0.5]} />
          <meshBasicMaterial map={projectStencil} transparent opacity={0.95} />
        </mesh>
      </group>

      {/* ZONE C: Open Workstations Felt Floor Runner */}
      <group position={[5.0, 0.002, 4.8]}>
        {/* Felt Base Runner */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[3.3, 5.0]} />
          <meshStandardMaterial color="#c8c5bc" roughness={0.92} />
        </mesh>
        {/* Edge Trim Stripe */}
        <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[3.34, 0.04]} />
          <meshBasicMaterial color="#598e72" />
        </mesh>
        {/* Workstation Pod Demarcation Lines */}
        <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[3.2, 0.02]} />
          <meshBasicMaterial color="#b2afa6" />
        </mesh>
        {/* Floor Stencil */}
        <mesh position={[0, 0.003, 2.2]} rotation={[-Math.PI / 2, 0, Math.PI]}>
          <planeGeometry args={[2.0, 0.5]} />
          <meshBasicMaterial map={workstationStencil} transparent opacity={0.9} />
        </mesh>
      </group>

      {/* ZONE D: Lounge Breakout Circular Designer Rug */}
      <group position={[3.3, 0.003, 8.15]}>
        {/* Outer Circular Ring */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[1.42, 48]} />
          <meshStandardMaterial color="#bcb4a6" roughness={0.88} />
        </mesh>
        {/* Inner Warm Linen Rug */}
        <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[1.32, 48]} />
          <meshStandardMaterial color="#c7c0b2" roughness={0.85} />
        </mesh>
        {/* Concentric Accent Ring */}
        <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.9, 0.94, 48]} />
          <meshBasicMaterial color="#9673aa" transparent opacity={0.65} />
        </mesh>
        {/* Floor Stencil */}
        <mesh position={[-0.2, 0.004, 0.8]} rotation={[-Math.PI / 2, 0, Math.PI]}>
          <planeGeometry args={[1.8, 0.45]} />
          <meshBasicMaterial map={loungeStencil} transparent opacity={0.9} />
        </mesh>
      </group>

      {/* ZONE E: Kitchenette / Pantry Terrazzo Flooring */}
      <group position={[1.5, 0.003, 1.25]}>
        {/* Terrazzo Tile Slab */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[2.5, 2.1]} />
          <meshStandardMaterial color="#dfded9" roughness={0.75} />
        </mesh>
        {/* Border Trim */}
        <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.54, 2.14]} />
          <meshBasicMaterial color="#b5b3aa" />
        </mesh>
        {/* Tile Joint Cuts */}
        {[-0.6, 0, 0.6].map((tx) => (
          <mesh key={tx} position={[tx, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.015, 2.05]} />
            <meshBasicMaterial color="#cac8bf" />
          </mesh>
        ))}
        {/* Floor Stencil */}
        <mesh position={[0, 0.004, 0.8]} rotation={[-Math.PI / 2, 0, Math.PI]}>
          <planeGeometry args={[1.8, 0.45]} />
          <meshBasicMaterial map={pantryStencil} transparent opacity={0.85} />
        </mesh>
      </group>

      {/* ============================================================== */}
      {/* 3. CIRCULATION HIGHWAY (Main North-South Walking Corridor)     */}
      {/* ============================================================== */}
      <group position={[7.25, 0.003, 5.0]}>
        {/* Hallway subtle pavement lane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.1, 9.4]} />
          <meshBasicMaterial color="#d1cfc7" transparent opacity={0.4} />
        </mesh>

        {/* Center Dashed Corridor Guidance Line */}
        {[-4.0, -3.2, -2.4, -1.6, -0.8, 0, 0.8, 1.6, 2.4, 3.2, 4.0].map((zOffset) => (
          <mesh key={zOffset} position={[0, 0.002, zOffset]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.06, 0.45]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.7} />
          </mesh>
        ))}

        {/* Corridor Directional Arrows (Subtle chevron markings) */}
        {[-2.0, 2.0].map((zOffset) => (
          <group key={zOffset} position={[0, 0.003, zOffset]}>
            <mesh position={[-0.08, 0, -0.06]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
              <planeGeometry args={[0.05, 0.18]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.75} />
            </mesh>
            <mesh position={[0.08, 0, -0.06]} rotation={[-Math.PI / 2, 0, -Math.PI / 4]}>
              <planeGeometry args={[0.05, 0.18]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.75} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ============================================================== */}
      {/* 4. ENTRANCE THRESHOLD STRIPES (Doorway Demarcation Lines)      */}
      {/* ============================================================== */}

      {/* Customer Room Threshold Entry (Gold / Amber Stripe) */}
      <group position={[7.95, 0.004, 2.4]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.22, 0.85]} />
          <meshBasicMaterial color="#e59838" />
        </mesh>
        {/* Dashed Caution Teeth */}
        {[-0.3, -0.1, 0.1, 0.3].map((offset) => (
          <mesh key={offset} position={[0, 0.001, offset]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.16, 0.08]} />
            <meshBasicMaterial color="#23272b" />
          </mesh>
        ))}
      </group>

      {/* Project Room Threshold Entry (Cyan / Teal Stripe) */}
      <group position={[7.95, 0.004, 5.65]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.22, 0.85]} />
          <meshBasicMaterial color="#4ca5b8" />
        </mesh>
        {/* Dashed Caution Teeth */}
        {[-0.3, -0.1, 0.1, 0.3].map((offset) => (
          <mesh key={offset} position={[0, 0.001, offset]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.16, 0.08]} />
            <meshBasicMaterial color="#23272b" />
          </mesh>
        ))}
      </group>

      {/* Printer Cabinet Service Clearance Strip (Hazard diagonal strip) */}
      <group position={[0.8, 0.004, 4.5]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.9, 0.06]} />
          <meshBasicMaterial color="#d4a359" transparent opacity={0.8} />
        </mesh>
      </group>

      {/* ============================================================== */}
      {/* 5. INTERACTIVE DESTINATION BEACON                             */}
      {/* ============================================================== */}
      <DestinationBeacon targetPoint={targetPoint ?? null} />
    </group>
  )
}
