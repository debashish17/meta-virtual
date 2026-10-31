import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useEffect, useRef, useMemo, Suspense } from 'react'
import * as THREE from 'three'
import { gridCells, OfficeZoneId, Point, WORLD, zoneAt } from './world'
import { FloorMarkings } from './FloorMarkings'

type SceneProps = {
  route: Point[]
  playerPosition: { current: Point }
  showGrid: boolean
  onMove: (point: Point) => void
  onZone: (zone: 'customer' | 'project') => void
  onPlayerZoneChange?: (zone: OfficeZoneId) => void
}

function AssetModel({
  path,
  position,
  rotation = [0, 0, 0],
  scale = 1,
  onClick,
}: {
  path: string
  position: [number, number, number]
  rotation?: [number, number, number]
  scale?: number
  onClick?: () => void
}) {
  const { scene } = useGLTF(path)
  const clone = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        node.castShadow = true
        node.receiveShadow = true
      }
    })
    return c
  }, [scene])

  return (
    <primitive
      object={clone}
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={onClick ? (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick() } : undefined}
    />
  )
}

function ZoneReporter({ playerPosition, onPlayerZoneChange }: {
  playerPosition: { current: Point }
  onPlayerZoneChange?: (zone: OfficeZoneId) => void
}) {
  const lastZone = useRef<OfficeZoneId>('open')
  useFrame(() => {
    if (!onPlayerZoneChange) return
    const nextZone = zoneAt(playerPosition.current)
    if (nextZone !== lastZone.current) {
      lastZone.current = nextZone
      onPlayerZoneChange(nextZone)
    }
  })
  return null
}

function Avatar({
  route,
  playerPosition,
  startPosition = WORLD.start,
  outfitColor = '#416d67',
  markerColor = '#e2a55d'
}: {
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
        const step = Math.min(distance, delta * 2.1)
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
    </group>
  )
}

export default function Interactive3DOffice({
  route,
  playerPosition,
  showGrid,
  onMove,
  onZone,
  onPlayerZoneChange,
}: SceneProps) {
  const cells = gridCells()
  const teammatePosition = useRef<Point>([7.55, 8.45])

  return (
    <>
      <ZoneReporter playerPosition={playerPosition} onPlayerZoneChange={onPlayerZoneChange} />

      {/* Lighting */}
      <hemisphereLight args={['#fff9ec', '#81867f', 2.3]} />
      <directionalLight
        position={[-6, 14, 8]}
        intensity={2.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />
      <color attach="background" args={['#e8e6df']} />

      {/* Clickable Floor Base */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[6, -0.01, 5]}
        receiveShadow
        onPointerDown={(event) => {
          if (event.button !== 0) return
          onMove([event.point.x, event.point.z])
        }}
      >
        <planeGeometry args={[WORLD.width, WORLD.depth]} />
        <meshStandardMaterial color="#d7d5ce" roughness={0.85} />
      </mesh>

      {/* Architectural Floor Markings & Zone Rugs & Beacon */}
      <FloorMarkings targetPoint={route.length > 0 ? route[route.length - 1] : null} />

      {/* Walkable grid cells */}
      {showGrid && cells.map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.008, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[WORLD.cell * 0.94, WORLD.cell * 0.94]} />
          <meshBasicMaterial color="#5bb381" transparent opacity={0.25} />
        </mesh>
      ))}

      <Suspense fallback={null}>
        {/* ============================================================== */}
        {/* ARCHITECTURAL SHELL (Walls, Windows, Slabs, Track Lights)       */}
        {/* ============================================================== */}
        {/* Back North Wall: City window wall + straight drywall sections */}
        <AssetModel path="/assets/models/architecture.window-city.glb" position={[3.2, 0, 0.08]} />
        <AssetModel path="/assets/models/architecture.wall-straight.glb" position={[0.8, 0, 0.08]} />
        <AssetModel path="/assets/models/architecture.wall-straight.glb" position={[5.8, 0, 0.08]} />
        <AssetModel path="/assets/models/architecture.wall-corner.glb" position={[0.08, 0, 0.08]} />

        {/* West Wall Drywall sections */}
        <AssetModel path="/assets/models/architecture.wall-straight.glb" position={[0.08, 0, 2.5]} rotation={[0, Math.PI / 2, 0]} />
        <AssetModel path="/assets/models/architecture.wall-straight.glb" position={[0.08, 0, 5.0]} rotation={[0, Math.PI / 2, 0]} />
        <AssetModel path="/assets/models/architecture.wall-straight.glb" position={[0.08, 0, 7.5]} rotation={[0, Math.PI / 2, 0]} />

        {/* East Wall Drywall sections */}
        <AssetModel path="/assets/models/architecture.wall-straight.glb" position={[11.92, 0, 2.5]} rotation={[0, -Math.PI / 2, 0]} />
        <AssetModel path="/assets/models/architecture.wall-straight.glb" position={[11.92, 0, 5.0]} rotation={[0, -Math.PI / 2, 0]} />
        <AssetModel path="/assets/models/architecture.wall-straight.glb" position={[11.92, 0, 7.5]} rotation={[0, -Math.PI / 2, 0]} />

        {/* Overhead track light beams */}
        <AssetModel path="/assets/models/architecture.ceiling-track.glb" position={[4.5, 2.3, 3.8]} />
        <AssetModel path="/assets/models/architecture.ceiling-track.glb" position={[9.8, 2.3, 3.8]} />

        {/* ============================================================== */}
        {/* ZONE 1: OPEN WORKSTATION BAY                                   */}
        {/* ============================================================== */}
        <AssetModel path="/assets/models/workstation.desk-4p.glb" position={[5.0, 0, 3.8]} />
        <AssetModel path="/assets/models/seating.office-chair.glb" position={[4.3, 0, 4.4]} />
        <AssetModel path="/assets/models/seating.office-chair.glb" position={[5.7, 0, 4.4]} />
        <AssetModel path="/assets/models/seating.office-chair.glb" position={[4.3, 0, 3.2]} rotation={[0, Math.PI, 0]} />
        <AssetModel path="/assets/models/seating.office-chair.glb" position={[5.7, 0, 3.2]} rotation={[0, Math.PI, 0]} />

        <AssetModel path="/assets/models/workstation.desk-2p.glb" position={[5.0, 0, 5.9]} />
        <AssetModel path="/assets/models/seating.office-chair.glb" position={[4.3, 0, 6.5]} />
        <AssetModel path="/assets/models/seating.office-chair.glb" position={[5.7, 0, 6.5]} />

        <AssetModel path="/assets/models/greenery.plant-floor-a.glb" position={[3.3, 0, 3.2]} />
        <AssetModel path="/assets/models/greenery.plant-large.glb" position={[6.7, 0, 6.0]} />

        {/* ============================================================== */}
        {/* ZONE 2: ENCLOSED GLASS CONFERENCE ROOM (CUSTOMER ROOM)         */}
        {/* ============================================================== */}
        <AssetModel path="/assets/models/architecture.glass-panel.glb" position={[7.95, 0, 1.15]} rotation={[0, Math.PI / 2, 0]} />
        <AssetModel path="/assets/models/architecture.glass-door.glb" position={[7.95, 0, 2.35]} rotation={[0, Math.PI / 2, 0]} />
        <AssetModel path="/assets/models/architecture.glass-panel.glb" position={[7.95, 0, 3.10]} rotation={[0, Math.PI / 2, 0]} />
        <AssetModel path="/assets/models/architecture.glass-panel.glb" position={[9.1, 0, 3.42]} />
        <AssetModel path="/assets/models/architecture.glass-panel.glb" position={[10.7, 0, 3.42]} />

        <AssetModel path="/assets/models/meeting.table-6p.glb" position={[9.9, 0, 1.8]} />
        <AssetModel path="/assets/models/seating.meeting-chair.glb" position={[9.3, 0, 1.3]} />
        <AssetModel path="/assets/models/seating.meeting-chair.glb" position={[10.5, 0, 1.3]} />
        <AssetModel path="/assets/models/seating.meeting-chair.glb" position={[9.3, 0, 2.3]} rotation={[0, Math.PI, 0]} />
        <AssetModel path="/assets/models/seating.meeting-chair.glb" position={[10.5, 0, 2.3]} rotation={[0, Math.PI, 0]} />

        <AssetModel
          path="/assets/models/tech.wall-screen.glb"
          position={[10.2, 1.25, 3.35]}
          onClick={() => onZone('customer')}
        />
        <AssetModel path="/assets/models/tech.whiteboard.glb" position={[8.5, 0, 0.7]} rotation={[0, 0.2, 0]} />

        {/* ============================================================== */}
        {/* ZONE 3: PROJECT ROOM / FOCUS SPACE                             */}
        {/* ============================================================== */}
        <AssetModel path="/assets/models/architecture.glass-panel.glb" position={[7.95, 0, 4.4]} rotation={[0, Math.PI / 2, 0]} />
        <AssetModel path="/assets/models/architecture.glass-door.glb" position={[7.95, 0, 5.65]} rotation={[0, Math.PI / 2, 0]} />
        <AssetModel path="/assets/models/architecture.glass-panel.glb" position={[7.95, 0, 6.55]} rotation={[0, Math.PI / 2, 0]} />
        <AssetModel path="/assets/models/architecture.glass-panel.glb" position={[9.1, 0, 6.95]} />
        <AssetModel path="/assets/models/architecture.glass-panel.glb" position={[10.7, 0, 6.95]} />

        <AssetModel path="/assets/models/workstation.desk-l-shape.glb" position={[9.8, 0, 5.2]} />
        <AssetModel path="/assets/models/seating.office-chair.glb" position={[9.8, 0, 4.5]} />

        <AssetModel
          path="/assets/models/tech.wall-screen.glb"
          position={[10.2, 1.25, 6.88]}
          onClick={() => onZone('project')}
        />
        <AssetModel path="/assets/models/architecture.phone-booth.glb" position={[11.2, 0, 6.0]} />

        {/* ============================================================== */}
        {/* ZONE 4: KITCHENETTE & UTILITY BAY                              */}
        {/* ============================================================== */}
        <AssetModel path="/assets/models/kitchen.run.glb" position={[1.5, 0, 0.9]} />
        <AssetModel path="/assets/models/seating.stool-high.glb" position={[2.6, 0, 1.8]} />
        <AssetModel path="/assets/models/storage.shelf-unit.glb" position={[0.7, 0, 3.2]} rotation={[0, Math.PI / 2, 0]} />
        <AssetModel path="/assets/models/utility.printer-cabinet.glb" position={[0.8, 0, 4.5]} rotation={[0, Math.PI / 2, 0]} />

        {/* ============================================================== */}
        {/* ZONE 5: BREAKOUT LOUNGE                                        */}
        {/* ============================================================== */}
        <AssetModel path="/assets/models/lounge.rug.glb" position={[3.6, 0, 8.2]} />
        <AssetModel path="/assets/models/seating.sofa-2p.glb" position={[3.6, 0, 7.8]} />
        <AssetModel path="/assets/models/seating.lounge-chair.glb" position={[2.2, 0, 8.4]} rotation={[0, Math.PI / 4, 0]} />
        <AssetModel path="/assets/models/lounge.coffee-table.glb" position={[3.6, 0, 8.5]} />
        <AssetModel path="/assets/models/greenery.plant-large.glb" position={[1.4, 0, 7.5]} />

        {/* ============================================================== */}
        {/* ZONE 6: STANDING DESK & POD                                    */}
        {/* ============================================================== */}
        <AssetModel path="/assets/models/workstation.desk-standing.glb" position={[9.5, 0, 8.2]} />
        <AssetModel path="/assets/models/seating.office-chair.glb" position={[9.5, 0, 8.8]} />
        <AssetModel path="/assets/models/storage.pedestal-drawer.glb" position={[10.9, 0, 8.2]} />
        <AssetModel path="/assets/models/greenery.plant-floor-a.glb" position={[11.2, 0, 9.2]} />

        {/* Players */}
        <Avatar route={route} playerPosition={playerPosition} />
        <Avatar route={[]} playerPosition={teammatePosition} startPosition={[7.55, 8.45]} outfitColor="#b76f49" markerColor="#cd9567" />
      </Suspense>
    </>
  )
}
