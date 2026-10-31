import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { gridCells, OfficeZoneId, Point, WORLD, zoneAt } from './world'

type SceneProps = {
  route: Point[]
  playerPosition: { current: Point }
  showGrid: boolean
  onMove: (point: Point) => void
  onZone: (zone: 'customer' | 'project') => void
  onPlayerZoneChange?: (zone: OfficeZoneId) => void
}

function Box({ position, size, color, roughness = 0.78, transparent = false, opacity = 1, onClick, castShadow = true, receiveShadow = true }: {
  position: [number, number, number]
  size: [number, number, number]
  color: string
  roughness?: number
  transparent?: boolean
  opacity?: number
  onClick?: () => void
  castShadow?: boolean
  receiveShadow?: boolean
}) {
  return (
    <mesh position={position} castShadow={castShadow} receiveShadow={receiveShadow} onPointerDown={onClick ? (event) => { event.stopPropagation(); onClick() } : undefined}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={roughness} transparent={transparent} opacity={opacity} depthWrite={!transparent} />
    </mesh>
  )
}

function Plant({ x, z, pot = '#d8d5cc', scale = 1 }: { x: number; z: number; pot?: string; scale?: number }) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 0.18, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.23, 0.36, 8]} />
        <meshStandardMaterial color={pot} roughness={0.9} />
      </mesh>
      {[0, 1, 2, 3, 4].map((leaf) => {
        const angle = (leaf / 5) * Math.PI * 2
        return (
          <mesh key={leaf} position={[Math.cos(angle) * 0.17, 0.58 + (leaf % 2) * 0.12, Math.sin(angle) * 0.17]} rotation={[0, -angle, -0.38]} castShadow>
            <sphereGeometry args={[0.14, 7, 5]} />
            <meshStandardMaterial color={leaf % 2 ? '#47814f' : '#5d9257'} roughness={0.85} />
          </mesh>
        )
      })}
      <mesh position={[0, 0.78, 0]} castShadow>
        <sphereGeometry args={[0.17, 7, 6]} />
        <meshStandardMaterial color="#47784a" roughness={0.86} />
      </mesh>
    </group>
  )
}

function Desk({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Box position={[0, 0.76, 0]} size={[1.4, 0.1, 0.7]} color="#c78d4d" />
      {[-0.61, 0.61].map((dx) => [-0.27, 0.27].map((dz) => (
        <Box key={`${dx}-${dz}`} position={[dx, 0.37, dz]} size={[0.07, 0.74, 0.07]} color="#333b3c" />
      )))}
      <Box position={[0.02, 1.04, -0.2]} size={[0.54, 0.34, 0.06]} color="#20282c" />
      <Box position={[0.02, 0.86, -0.15]} size={[0.42, 0.025, 0.04]} color="#343c40" castShadow={false} receiveShadow={false} />
      <Box position={[-0.38, 0.82, 0.16]} size={[0.22, 0.025, 0.16]} color="#31383c" castShadow={false} receiveShadow={false} />
      <Box position={[0.48, 0.83, 0.08]} size={[0.11, 0.04, 0.11]} color="#f4f0e6" castShadow={false} receiveShadow={false} />
      <Box position={[0, 0.52, 0.63]} size={[0.55, 0.09, 0.52]} color="#252d31" />
      <Box position={[0, 0.83, 0.84]} size={[0.49, 0.48, 0.08]} color="#343d40" />
    </group>
  )
}

function ZoneReporter({ playerPosition, onPlayerZoneChange }: { playerPosition: { current: Point }; onPlayerZoneChange?: (zone: OfficeZoneId) => void }) {
  const lastZone = useRef<OfficeZoneId | null>(null)
  const elapsed = useRef(0)

  useFrame((_, delta) => {
    if (!onPlayerZoneChange) return
    elapsed.current += delta
    if (elapsed.current < 0.12 && lastZone.current !== null) return
    elapsed.current = 0
    const nextZone = zoneAt(playerPosition.current)
    if (nextZone !== lastZone.current) {
      lastZone.current = nextZone
      onPlayerZoneChange(nextZone)
    }
  })

  return null
}
function Avatar({ route, playerPosition, startPosition = WORLD.start, outfitColor = '#416d67', markerColor = '#e2a55d' }: {
  route: Point[]
  playerPosition: { current: Point }
  startPosition?: Point
  outfitColor?: string
  markerColor?: string
}) {
  const body = useRef<THREE.Group>(null)
  const leftArm = useRef<THREE.Group>(null)
  const rightArm = useRef<THREE.Group>(null)
  const leftLeg = useRef<THREE.Group>(null)
  const rightLeg = useRef<THREE.Group>(null)
  const waypoint = useRef(0)

  useEffect(() => { waypoint.current = 0 }, [route])

  useFrame(({ clock }, delta) => {
    if (!body.current) return
    let walking = false
    const next = route[waypoint.current]
    if (next) {
      const dx = next[0] - body.current.position.x
      const dz = next[1] - body.current.position.z
      const distance = Math.hypot(dx, dz)
      if (distance < 0.055) {
        waypoint.current += 1
      } else {
        walking = true
        const step = Math.min(distance, delta * 2.05)
        body.current.position.x += (dx / distance) * step
        body.current.position.z += (dz / distance) * step
        body.current.rotation.y = Math.atan2(dx, dz)
      }
    }
    body.current.position.y = walking ? Math.abs(Math.sin(clock.elapsedTime * 11)) * 0.035 : 0
    const swing = walking ? Math.sin(clock.elapsedTime * 10) * 0.38 : Math.sin(clock.elapsedTime * 1.5) * 0.025
    if (leftArm.current) leftArm.current.rotation.x = swing
    if (rightArm.current) rightArm.current.rotation.x = -swing
    if (leftLeg.current) leftLeg.current.rotation.x = -swing
    if (rightLeg.current) rightLeg.current.rotation.x = swing
    playerPosition.current = [body.current.position.x, body.current.position.z]
  })

  return (
    <group ref={body} position={[startPosition[0], 0, startPosition[1]]}>
      <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.34, 24]} />
        <meshBasicMaterial color="#23302c" transparent opacity={0.22} />
      </mesh>
      <mesh position={[0, 0.075, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.29, 0.34, 28]} />
        <meshBasicMaterial color={markerColor} transparent opacity={0.9} />
      </mesh>
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.88, 0]} castShadow>
          <capsuleGeometry args={[0.25, 0.45, 4, 8]} />
          <meshStandardMaterial color={outfitColor} roughness={0.82} />
        </mesh>
        <mesh position={[0, 1.43, 0]} castShadow>
          <sphereGeometry args={[0.29, 12, 10]} />
          <meshStandardMaterial color="#e3b892" roughness={0.9} />
        </mesh>
        <mesh position={[0, 1.57, -0.045]} castShadow>
          <sphereGeometry args={[0.295, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          <meshStandardMaterial color="#49372d" roughness={0.95} />
        </mesh>
        <mesh position={[0, 1.06, 0.24]} castShadow>
          <boxGeometry args={[0.12, 0.12, 0.035]} />
          <meshStandardMaterial color="#e9c66d" roughness={0.65} />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side} ref={side < 0 ? leftArm : rightArm} position={[side * 0.29, 1.04, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow>
              <capsuleGeometry args={[0.095, 0.3, 3, 7]} />
              <meshStandardMaterial color={outfitColor} roughness={0.82} />
            </mesh>
            <mesh position={[0, -0.42, 0]} castShadow>
              <sphereGeometry args={[0.085, 8, 6]} />
              <meshStandardMaterial color="#e3b892" roughness={0.9} />
            </mesh>
          </group>
        ))}
        {[-1, 1].map((side) => (
          <group key={side} ref={side < 0 ? leftLeg : rightLeg} position={[side * 0.13, 0.51, 0]}>
            <mesh position={[0, -0.22, 0]} castShadow>
              <capsuleGeometry args={[0.105, 0.32, 3, 7]} />
              <meshStandardMaterial color="#34454c" roughness={0.88} />
            </mesh>
            <mesh position={[0, -0.43, 0.06]} castShadow>
              <boxGeometry args={[0.22, 0.12, 0.32]} />
              <meshStandardMaterial color="#eee8dc" roughness={0.78} />
            </mesh>
          </group>
        ))}
      </group>
      <mesh position={[0, 1.95, 0]}>
        <sphereGeometry args={[0.07, 8, 6]} />
        <meshBasicMaterial color="#f0b66f" />
      </mesh>
    </group>
  )
}

function Office({ route, playerPosition, showGrid, onMove, onZone, onPlayerZoneChange }: SceneProps) {
  const cells = gridCells()
  const teammatePosition = useRef<Point>([7.55, 8.45])
  return (
    <>
      <ZoneReporter playerPosition={playerPosition} onPlayerZoneChange={onPlayerZoneChange} />
      <hemisphereLight args={['#fff9ec', '#81867f', 2.15]} />
      <directionalLight position={[-5, 12, 7]} intensity={2.2} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14} />
      <color attach="background" args={['#e8e6df']} />

      {/* A single floor mesh keeps click-to-move coordinates stable. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[6, -0.06, 5]} receiveShadow onPointerDown={(event) => {
        if (event.button !== 0) return
        onMove([event.point.x, event.point.z])
      }}>
        <planeGeometry args={[WORLD.width, WORLD.depth]} />
        <meshStandardMaterial color="#d7d5ce" roughness={0.94} />
      </mesh>
      {showGrid && cells.map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.008, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[WORLD.cell * 0.94, WORLD.cell * 0.94]} />
          <meshBasicMaterial color="#8b9b8d" transparent opacity={0.18} />
        </mesh>
      ))}

      {/* Back and side walls; the near side is omitted for a readable cutaway. */}
      <Box position={[6, 1.3, 0.08]} size={[12, 2.6, 0.16]} color="#e5e1d8" />
      <Box position={[0.08, 1.3, 5]} size={[0.16, 2.6, 10]} color="#e8e4dc" />
      <Box position={[11.92, 1.3, 5]} size={[0.16, 2.6, 10]} color="#e8e4dc" />
      {[1.1, 2.9, 4.7, 6.5].map((x) => (
        <group key={x}>
          <Box position={[x, 1.45, 0.18]} size={[1.55, 2.15, 0.035]} color="#bed0ce" transparent opacity={0.5} castShadow={false} />
          <Box position={[x - 0.8, 1.35, 0.2]} size={[0.045, 2.45, 0.07]} color="#424849" />
          <Box position={[x + 0.8, 1.35, 0.2]} size={[0.045, 2.45, 0.07]} color="#424849" />
        </group>
      ))}
      <Box position={[4.2, 1.28, 0.25]} size={[3.3, 0.16, 0.18]} color="#3d4545" />

      {/* Customer room: glass, charcoal framing, and a clear west-side doorway. */}
      <Box position={[7.96, 1.34, 1.16]} size={[0.09, 2.55, 1.52]} color="#344042" />
      <Box position={[7.96, 1.34, 3.14]} size={[0.09, 2.55, 0.58]} color="#344042" />
      <Box position={[9.95, 1.34, 3.45]} size={[3.9, 2.55, 0.09]} color="#344042" />
      <Box position={[9.95, 1.34, 3.41]} size={[3.7, 2.31, 0.025]} color="#b9cece" transparent opacity={0.25} castShadow={false} />
      <Box position={[7.96, 1.34, 1.2]} size={[0.025, 2.34, 1.43]} color="#b9cece" transparent opacity={0.24} castShadow={false} />
      <Box position={[7.96, 1.34, 3.12]} size={[0.025, 2.34, 0.52]} color="#b9cece" transparent opacity={0.24} castShadow={false} />
      <Box position={[8.43, 1.22, 2.4]} size={[0.04, 2.35, 0.04]} color="#40494a" />
      <Box position={[8.58, 1.22, 2.4]} size={[0.04, 2.35, 0.04]} color="#40494a" />
      <Box position={[9.8, 2.32, 3.43]} size={[3.8, 0.035, 0.12]} color="#333d3d" />
      <Box position={[10.25, 1.86, 3.37]} size={[1.5, 0.72, 0.08]} color="#202729" onClick={() => onZone('customer')} />
      <Box position={[10.25, 1.48, 3.31]} size={[1.2, 0.05, 0.14]} color="#c98d4c" />
      <mesh position={[10.25, 1.87, 3.315]}>
        <planeGeometry args={[1.25, 0.48]} />
        <meshBasicMaterial color="#233a3a" />
      </mesh>

      {/* Project room, with a clickable status display. */}
      <Box position={[7.96, 1.34, 4.55]} size={[0.09, 2.55, 1.4]} color="#344042" />
      <Box position={[7.96, 1.34, 6.55]} size={[0.09, 2.55, 0.9]} color="#344042" />
      <Box position={[9.95, 1.34, 7.0]} size={[3.9, 2.55, 0.09]} color="#344042" />
      <Box position={[7.96, 1.34, 4.58]} size={[0.025, 2.33, 1.33]} color="#b9cece" transparent opacity={0.23} castShadow={false} />
      <Box position={[7.96, 1.34, 6.52]} size={[0.025, 2.33, 0.84]} color="#b9cece" transparent opacity={0.23} castShadow={false} />
      <Box position={[8.43, 1.22, 5.65]} size={[0.04, 2.35, 0.04]} color="#40494a" />
      <Box position={[8.58, 1.22, 5.65]} size={[0.04, 2.35, 0.04]} color="#40494a" />
      <Box position={[10.45, 1.86, 6.91]} size={[1.9, 0.82, 0.08]} color="#f1ede2" onClick={() => onZone('project')} />
      <Box position={[10.45, 1.86, 6.855]} size={[1.63, 0.57, 0.025]} color="#d7e4dc" castShadow={false} />
      <Box position={[10.35, 1.2, 6.87]} size={[1.2, 0.1, 0.32]} color="#c78d4d" />

      {/* Kitchenette and printer alcove */}
      <Box position={[1.8, 0.48, 0.86]} size={[2.55, 0.86, 0.72]} color="#a96f39" />
      <Box position={[1.8, 0.94, 0.84]} size={[2.62, 0.1, 0.78]} color="#30383a" />
      <Box position={[1.05, 1.37, 0.72]} size={[0.72, 0.7, 0.48]} color="#c18a4e" />
      <Box position={[2.38, 1.16, 0.73]} size={[0.45, 0.34, 0.36]} color="#e9e5dc" />
      <Box position={[1.54, 1.11, 0.64]} size={[0.32, 0.25, 0.28]} color="#262d30" />
      <Box position={[1.1, 0.55, 4.24]} size={[1.0, 0.88, 0.76]} color="#a87440" />
      <Box position={[1.1, 1.12, 4.2]} size={[0.9, 0.42, 0.5]} color="#e1e4e3" />
      <Box position={[1.1, 1.35, 4.2]} size={[0.55, 0.035, 0.025]} color="#687171" />

      {/* Four workstations arranged around a continuous central route. */}
      <Desk x={3.9} z={3.78} />
      <Desk x={5.85} z={3.78} />
      <Desk x={3.9} z={5.88} />
      <Desk x={5.85} z={5.88} />
      <Plant x={3.05} z={3.05} scale={0.72} />
      <Plant x={6.9} z={6.7} scale={0.8} />
      <Plant x={1.05} z={2.5} scale={0.9} />
      <Plant x={11.0} z={0.75} scale={0.76} />
      <Plant x={11.15} z={6.35} scale={0.75} />

      {/* Room furniture, low details, and entrance marker. */}
      <Box position={[9.95, 0.78, 1.68]} size={[1.65, 0.1, 0.78]} color="#c58c4e" />
      <Box position={[9.05, 0.45, 1.68]} size={[0.08, 0.74, 0.08]} color="#343c3c" />
      <Box position={[10.85, 0.45, 1.68]} size={[0.08, 0.74, 0.08]} color="#343c3c" />
      <Box position={[6, 0.02, 9.82]} size={[1.7, 0.04, 0.22]} color="#c68c4d" castShadow={false} />
      <Box position={[4.9, 0.9, 9.65]} size={[0.18, 1.8, 0.18]} color="#3c4545" />
      <Box position={[7.1, 0.9, 9.65]} size={[0.18, 1.8, 0.18]} color="#3c4545" />

      <Avatar route={route} playerPosition={playerPosition} />
      <Avatar route={[]} playerPosition={teammatePosition} startPosition={[7.55, 8.45]} outfitColor="#b76f49" markerColor="#cd9567" />
    </>
  )
}

export default function WorldScene(props: SceneProps) {
  return (
    <Office {...props} />
  )
}


