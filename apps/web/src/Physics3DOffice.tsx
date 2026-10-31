import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useGLTF, ContactShadows } from '@react-three/drei'
import {
  Physics,
  RigidBody,
  CuboidCollider,
  CapsuleCollider,
  CylinderCollider,
  RapierRigidBody,
} from '@react-three/rapier'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { useEffect, useRef, useMemo, useState, Suspense } from 'react'
import * as THREE from 'three'
import { gridCells, OfficeZoneId, Point, WORLD, zoneAt } from './world'
import { FloorMarkings } from './FloorMarkings'

type PhysicsOfficeProps = {
  route: Point[]
  playerPosition: { current: Point }
  showGrid: boolean
  showPhysicsDebug: boolean
  physicsResetTrigger: number
  dropPropsTrigger: number
  onMove: (point: Point) => void
  onZone: (zone: 'customer' | 'project') => void
  onPlayerZoneChange?: (zone: OfficeZoneId) => void
}

// Model renderer with material shadow and PBR adjustments
function AssetMesh({
  path,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  onClick,
}: {
  path: string
  position?: [number, number, number]
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

// Zone reporter component
function ZoneReporter({
  playerPosition,
  onPlayerZoneChange,
}: {
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

// Dynamic Physical Chair that glides and swivels smoothly on casters
// Locked upright (enabledRotations = [false, true, false]) to prevent tipping or jittering
function PhysicsChair({
  path,
  startPos,
  startRot = [0, 0, 0],
  resetTrigger,
  mass = 12,
  colliderRadius = 0.26,
  colliderHeight = 0.82,
}: {
  path: string
  startPos: [number, number, number]
  startRot?: [number, number, number]
  resetTrigger: number
  mass?: number
  colliderRadius?: number
  colliderHeight?: number
}) {
  const rb = useRef<RapierRigidBody>(null)

  useEffect(() => {
    if (!rb.current) return
    rb.current.setTranslation({ x: startPos[0], y: startPos[1] + 0.02, z: startPos[2] }, true)
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...startRot))
    rb.current.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
    rb.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
    rb.current.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }, [resetTrigger, startPos, startRot])

  return (
    <RigidBody
      ref={rb}
      type="dynamic"
      colliders={false}
      position={startPos}
      rotation={startRot}
      mass={mass}
      enabledRotations={[false, true, false]}
      canSleep={true}
      linearDamping={8.5}
      angularDamping={8.0}
      restitution={0.0}
      friction={0.92}
    >
      <CylinderCollider args={[colliderHeight / 2, colliderRadius]} position={[0, colliderHeight / 2, 0]} />
      {/* Visual mesh - No click handler so floor clicks never fling chairs! */}
      <AssetMesh path={path} />
    </RigidBody>
  )
}

// Interactive Physics Prop (Coffee cup, dice, stress balls) that can be thrown/nudged
type DynamicPropData = {
  id: string
  type: 'cup' | 'cube' | 'sphere'
  position: [number, number, number]
  color: string
  mass: number
}

function PhysicsProp({
  prop,
  onClick,
}: {
  prop: DynamicPropData
  onClick: (rb: RapierRigidBody) => void
}) {
  const rb = useRef<RapierRigidBody>(null)

  return (
    <RigidBody
      ref={rb}
      type="dynamic"
      position={prop.position}
      mass={prop.mass}
      canSleep={true}
      linearDamping={4.0}
      angularDamping={4.0}
      restitution={prop.type === 'sphere' ? 0.5 : 0.05}
      friction={0.9}
      colliders={false}
    >
      {prop.type === 'cube' && (
        <>
          <CuboidCollider args={[0.1, 0.1, 0.1]} position={[0, 0.1, 0]} />
          <mesh
            position={[0, 0.1, 0]}
            castShadow
            receiveShadow
            onClick={(e) => {
              e.stopPropagation()
              if (rb.current) onClick(rb.current)
            }}
          >
            <boxGeometry args={[0.2, 0.2, 0.2]} />
            <meshStandardMaterial color={prop.color} roughness={0.4} metalness={0.1} />
          </mesh>
        </>
      )}
      {prop.type === 'sphere' && (
        <>
          <CylinderCollider args={[0.1, 0.1]} position={[0, 0.1, 0]} />
          <mesh
            position={[0, 0.1, 0]}
            castShadow
            receiveShadow
            onClick={(e) => {
              e.stopPropagation()
              if (rb.current) onClick(rb.current)
            }}
          >
            <sphereGeometry args={[0.11, 16, 16]} />
            <meshStandardMaterial color={prop.color} roughness={0.3} metalness={0.2} />
          </mesh>
        </>
      )}
      {prop.type === 'cup' && (
        <>
          <CylinderCollider args={[0.11, 0.075]} position={[0, 0.11, 0]} />
          <group
            position={[0, 0, 0]}
            onClick={(e) => {
              e.stopPropagation()
              if (rb.current) onClick(rb.current)
            }}
          >
            <mesh position={[0, 0.11, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.07, 0.06, 0.2, 16]} />
              <meshStandardMaterial color={prop.color} roughness={0.5} />
            </mesh>
            <mesh position={[0.075, 0.11, 0]} castShadow>
              <torusGeometry args={[0.035, 0.013, 8, 16]} />
              <meshStandardMaterial color={prop.color} roughness={0.5} />
            </mesh>
          </group>
        </>
      )}
    </RigidBody>
  )
}

// Physical Character Controller (Alex Morgan)
function PhysicalPlayer({
  route,
  playerPosition,
  resetTrigger,
}: {
  route: Point[]
  playerPosition: { current: Point }
  resetTrigger: number
}) {
  const rb = useRef<RapierRigidBody>(null)
  const bodyGroup = useRef<THREE.Group>(null)
  const leftArm = useRef<THREE.Group>(null)
  const rightArm = useRef<THREE.Group>(null)
  const leftLeg = useRef<THREE.Group>(null)
  const rightLeg = useRef<THREE.Group>(null)
  const waypoint = useRef(0)
  const keysDown = useRef<{ [k: string]: boolean }>({})

  // Reset to start on trigger
  useEffect(() => {
    if (!rb.current) return
    rb.current.setTranslation({ x: WORLD.start[0], y: 0.1, z: WORLD.start[1] }, true)
    rb.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
  }, [resetTrigger])

  useEffect(() => {
    waypoint.current = 0
  }, [route])

  // Track WASD keys
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName ?? '')) return
      keysDown.current[e.key.toLowerCase()] = true
    }
    const onUp = (e: KeyboardEvent) => {
      keysDown.current[e.key.toLowerCase()] = false
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  useFrame(({ clock }) => {
    if (!rb.current || !bodyGroup.current) return

    const t = rb.current.translation()
    playerPosition.current = [t.x, t.z]

    let vx = 0
    let vz = 0
    let isMoving = false

    // 1. Direct WASD keyboard drive
    const keys = keysDown.current
    if (keys['w'] || keys['arrowup']) vz -= 1
    if (keys['s'] || keys['arrowdown']) vz += 1
    if (keys['a'] || keys['arrowleft']) vx -= 1
    if (keys['d'] || keys['arrowright']) vx += 1

    const manualMag = Math.hypot(vx, vz)
    if (manualMag > 0.01) {
      isMoving = true
      vx = (vx / manualMag) * 3.2
      vz = (vz / manualMag) * 3.2
      const targetAngle = Math.atan2(vx, vz)
      bodyGroup.current.rotation.y = THREE.MathUtils.lerp(bodyGroup.current.rotation.y, targetAngle, 0.25)
    } else {
      // 2. Click-to-move pathfinding waypoint guidance
      const next = route[waypoint.current]
      if (next) {
        const dx = next[0] - t.x
        const dz = next[1] - t.z
        const dist = Math.hypot(dx, dz)
        if (dist < 0.22) {
          waypoint.current += 1
        } else {
          isMoving = true
          vx = (dx / dist) * 3.0
          vz = (dz / dist) * 3.0
          const targetAngle = Math.atan2(dx, dz)
          bodyGroup.current.rotation.y = THREE.MathUtils.lerp(bodyGroup.current.rotation.y, targetAngle, 0.25)
        }
      }
    }

    const curVel = rb.current.linvel()
    if (isMoving) {
      rb.current.setLinvel({ x: vx, y: curVel.y, z: vz }, true)
    } else {
      // Only damp velocity if still drifting; don't forcefully wake up body every frame!
      if (Math.hypot(curVel.x, curVel.z) > 0.02) {
        rb.current.setLinvel({ x: 0, y: curVel.y, z: 0 }, true)
      }
    }

    // Avatar limb walk cycle animation
    const swing = isMoving
      ? Math.sin(clock.elapsedTime * 11) * 0.42
      : Math.sin(clock.elapsedTime * 1.6) * 0.03
    if (leftArm.current) leftArm.current.rotation.x = swing
    if (rightArm.current) rightArm.current.rotation.x = -swing
    if (leftLeg.current) leftLeg.current.rotation.x = -swing
    if (rightLeg.current) rightLeg.current.rotation.x = swing

    bodyGroup.current.position.y = isMoving ? Math.abs(Math.sin(clock.elapsedTime * 11)) * 0.04 : 0
  })

  return (
    <RigidBody
      ref={rb}
      type="dynamic"
      position={[WORLD.start[0], 0.1, WORLD.start[1]]}
      lockRotations
      linearDamping={8.5}
      colliders={false}
      friction={0.8}
    >
      <CapsuleCollider args={[0.55, 0.26]} position={[0, 0.85, 0]} />

      <group ref={bodyGroup}>
        {/* Contact shadow circle */}
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.34, 24]} />
          <meshBasicMaterial color="#23302c" transparent opacity={0.25} />
        </mesh>
        {/* Selection Marker Ring */}
        <mesh position={[0, 0.065, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.29, 0.35, 28]} />
          <meshBasicMaterial color="#e2a55d" transparent opacity={0.95} />
        </mesh>

        {/* Torso & Head */}
        <mesh position={[0, 0.88, 0]} castShadow>
          <capsuleGeometry args={[0.25, 0.45, 4, 8]} />
          <meshStandardMaterial color="#416d67" roughness={0.82} />
        </mesh>
        <mesh position={[0, 1.43, 0]} castShadow>
          <sphereGeometry args={[0.29, 12, 10]} />
          <meshStandardMaterial color="#e3b892" roughness={0.9} />
        </mesh>
        {/* Hair */}
        <mesh position={[0, 1.57, -0.045]} castShadow>
          <sphereGeometry args={[0.295, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          <meshStandardMaterial color="#49372d" roughness={0.95} />
        </mesh>
        {/* ID Badge */}
        <mesh position={[0, 1.06, 0.24]} castShadow>
          <boxGeometry args={[0.12, 0.12, 0.035]} />
          <meshStandardMaterial color="#e9c66d" roughness={0.65} />
        </mesh>

        {/* Arms */}
        {[-1, 1].map((side) => (
          <group key={side} ref={side < 0 ? leftArm : rightArm} position={[side * 0.29, 1.04, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow>
              <capsuleGeometry args={[0.095, 0.3, 3, 7]} />
              <meshStandardMaterial color="#416d67" roughness={0.82} />
            </mesh>
            <mesh position={[0, -0.42, 0]} castShadow>
              <sphereGeometry args={[0.085, 8, 6]} />
              <meshStandardMaterial color="#e3b892" roughness={0.9} />
            </mesh>
          </group>
        ))}

        {/* Legs */}
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
    </RigidBody>
  )
}

// Initial physics props placed cleanly on desks without floating
const INITIAL_PROPS: DynamicPropData[] = [
  { id: 'p1', type: 'cup', position: [4.8, 0.77, 3.6], color: '#ffffff', mass: 0.3 },
  { id: 'p2', type: 'cup', position: [5.4, 0.77, 4.0], color: '#d96b43', mass: 0.3 },
  { id: 'p3', type: 'cube', position: [4.9, 0.77, 5.8], color: '#3b82f6', mass: 0.4 },
  { id: 'p4', type: 'cup', position: [9.7, 0.77, 1.7], color: '#10b981', mass: 0.3 },
  { id: 'p5', type: 'sphere', position: [10.1, 0.78, 1.9], color: '#f59e0b', mass: 0.3 },
  { id: 'p6', type: 'cup', position: [2.0, 0.92, 1.0], color: '#ef4444', mass: 0.3 },
  { id: 'p7', type: 'cube', position: [3.6, 0.46, 8.5], color: '#8b5cf6', mass: 0.5 },
  { id: 'p8', type: 'sphere', position: [9.6, 1.06, 8.2], color: '#ec4899', mass: 0.3 },
]

export default function Physics3DOffice({
  route,
  playerPosition,
  showGrid,
  showPhysicsDebug,
  physicsResetTrigger,
  dropPropsTrigger,
  onMove,
  onZone,
  onPlayerZoneChange,
}: PhysicsOfficeProps) {
  const cells = gridCells()
  const [propsList, setPropsList] = useState<DynamicPropData[]>(INITIAL_PROPS)

  // Reset props when physics reset trigger fires
  useEffect(() => {
    setPropsList(INITIAL_PROPS)
  }, [physicsResetTrigger])

  // Drop extra props when dropPropsTrigger increments
  const lastDropId = useRef(dropPropsTrigger)
  useEffect(() => {
    if (dropPropsTrigger === 0 || dropPropsTrigger === lastDropId.current) return
    lastDropId.current = dropPropsTrigger

    const newItems: DynamicPropData[] = [
      { id: `drop-${Date.now()}-1`, type: 'cup', position: [5.0 + (Math.random() - 0.5) * 1.2, 2.5, 3.8 + (Math.random() - 0.5) * 0.4], color: '#f59e0b', mass: 0.3 },
      { id: `drop-${Date.now()}-2`, type: 'cube', position: [9.8 + (Math.random() - 0.5) * 0.8, 2.5, 1.8 + (Math.random() - 0.5) * 0.4], color: '#3b82f6', mass: 0.4 },
      { id: `drop-${Date.now()}-3`, type: 'sphere', position: [3.6 + (Math.random() - 0.5) * 0.6, 2.0, 8.5], color: '#10b981', mass: 0.3 },
      { id: `drop-${Date.now()}-4`, type: 'cup', position: [5.0 + (Math.random() - 0.5) * 1.0, 2.5, 5.9], color: '#ec4899', mass: 0.3 },
    ]
    setPropsList((current) => [...current, ...newItems])
  }, [dropPropsTrigger])

  const handlePropClick = (rb: RapierRigidBody) => {
    // Launch prop upward and forward
    rb.applyImpulse({
      x: (Math.random() - 0.5) * 2.5,
      y: 3.5 + Math.random() * 1.5,
      z: (Math.random() - 0.5) * 2.5,
    }, true)
  }

  return (
    <Suspense fallback={null}>
      <ZoneReporter playerPosition={playerPosition} onPlayerZoneChange={onPlayerZoneChange} />

      {/* High-Resolution Lighting Environment */}
      <hemisphereLight args={['#ffffff', '#7a8580', 2.1]} />
      <directionalLight
        position={[-7, 16, 9]}
        intensity={2.6}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.00015}
      />
      <color attach="background" args={['#e8e6df']} />

      {/* Soft Contact Shadows on Floor */}
      <ContactShadows
        position={[6, 0.005, 5]}
        opacity={0.65}
        scale={18}
        blur={1.8}
        far={3.5}
        resolution={1024}
        color="#1b2420"
      />

      {/* Clickable Floor Base Plane for Movement */}
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
        <meshStandardMaterial color="#d7d5ce" roughness={0.88} />
      </mesh>

      {/* Architectural Floor Markings & Zone Rugs & Beacon */}
      <FloorMarkings targetPoint={route.length > 0 ? route[route.length - 1] : null} />

      {/* Walkable Grid Overlay */}
      {showGrid && cells.map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.01, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[WORLD.cell * 0.94, WORLD.cell * 0.94]} />
          <meshBasicMaterial color="#5bb381" transparent opacity={0.25} />
        </mesh>
      ))}

      {/* ============================================================== */}
      {/* RAPIER 3D PHYSICS SIMULATION WORLD                             */}
      {/* ============================================================== */}
      <Physics gravity={[0, -9.81, 0]} debug={showPhysicsDebug}>
        {/* Solid Floor Collider (High friction, zero bounce) */}
        <RigidBody type="fixed" friction={0.95} restitution={0.0}>
          <CuboidCollider args={[WORLD.width / 2, 0.5, WORLD.depth / 2]} position={[WORLD.width / 2, -0.5, WORLD.depth / 2]} />
        </RigidBody>

        {/* Structural Perimeter Colliders */}
        <RigidBody type="fixed">
          <CuboidCollider args={[6.0, 1.4, 0.15]} position={[6.0, 1.4, 0.08]} />
        </RigidBody>
        <RigidBody type="fixed">
          <CuboidCollider args={[0.15, 1.4, 5.0]} position={[0.08, 1.4, 5.0]} />
        </RigidBody>
        <RigidBody type="fixed">
          <CuboidCollider args={[0.15, 1.4, 5.0]} position={[11.92, 1.4, 5.0]} />
        </RigidBody>

        {/* Customer Room Glass Partitions */}
        <RigidBody type="fixed">
          <CuboidCollider args={[0.06, 1.3, 0.75]} position={[7.95, 1.3, 1.15]} />
          <CuboidCollider args={[0.06, 1.3, 0.35]} position={[7.95, 1.3, 3.10]} />
          <CuboidCollider args={[1.9, 1.3, 0.06]} position={[9.9, 1.3, 3.42]} />
        </RigidBody>

        {/* Project Room Glass Partitions */}
        <RigidBody type="fixed">
          <CuboidCollider args={[0.06, 1.3, 0.7]} position={[7.95, 1.3, 4.4]} />
          <CuboidCollider args={[0.06, 1.3, 0.45]} position={[7.95, 1.3, 6.55]} />
          <CuboidCollider args={[1.9, 1.3, 0.06]} position={[9.9, 1.3, 6.95]} />
        </RigidBody>

        {/* ============================================================== */}
        {/* REALISTIC HOLLOW FURNITURE COLLIDERS (Zero Knee-Well Overlap) */}
        {/* ============================================================== */}
        {/* 4-Person Workstation Bench: Tabletop + Partition + End Legs */}
        <RigidBody type="fixed" friction={0.7} restitution={0.0}>
          <CuboidCollider args={[1.2, 0.03, 0.75]} position={[5.0, 0.72, 3.8]} />
          <CuboidCollider args={[1.2, 0.22, 0.03]} position={[5.0, 0.95, 3.8]} />
          <CuboidCollider args={[0.04, 0.35, 0.7]} position={[3.85, 0.35, 3.8]} />
          <CuboidCollider args={[0.04, 0.35, 0.7]} position={[6.15, 0.35, 3.8]} />
          <AssetMesh path="/assets/models/workstation.desk-4p.glb" position={[5.0, 0, 3.8]} />
        </RigidBody>

        {/* 2-Person Workstation Bench: Tabletop + End Legs */}
        <RigidBody type="fixed" friction={0.7} restitution={0.0}>
          <CuboidCollider args={[1.2, 0.03, 0.45]} position={[5.0, 0.72, 5.9]} />
          <CuboidCollider args={[0.04, 0.35, 0.42]} position={[3.85, 0.35, 5.9]} />
          <CuboidCollider args={[0.04, 0.35, 0.42]} position={[6.15, 0.35, 5.9]} />
          <AssetMesh path="/assets/models/workstation.desk-2p.glb" position={[5.0, 0, 5.9]} />
        </RigidBody>

        {/* 6-Person Conference Table: Tabletop + Pedestal Legs */}
        <RigidBody type="fixed" friction={0.7} restitution={0.0}>
          <CuboidCollider args={[1.2, 0.03, 0.55]} position={[9.9, 0.72, 1.8]} />
          <CuboidCollider args={[0.12, 0.35, 0.28]} position={[9.1, 0.35, 1.8]} />
          <CuboidCollider args={[0.12, 0.35, 0.28]} position={[10.7, 0.35, 1.8]} />
          <AssetMesh path="/assets/models/meeting.table-6p.glb" position={[9.9, 0, 1.8]} />
        </RigidBody>

        {/* L-Shape Workstation */}
        <RigidBody type="fixed" friction={0.7}>
          <CuboidCollider args={[0.85, 0.03, 0.55]} position={[9.8, 0.72, 5.2]} />
          <AssetMesh path="/assets/models/workstation.desk-l-shape.glb" position={[9.8, 0, 5.2]} />
          <AssetMesh path="/assets/models/tech.monitor-set.glb" position={[9.8, 0.75, 5.2]} />
        </RigidBody>

        {/* Kitchen Run Counter */}
        <RigidBody type="fixed" friction={0.8}>
          <CuboidCollider args={[1.1, 0.45, 0.4]} position={[1.5, 0.45, 0.9]} />
          <AssetMesh path="/assets/models/kitchen.run.glb" position={[1.5, 0, 0.9]} />
        </RigidBody>

        {/* Storage Shelving & Cabinets */}
        <RigidBody type="fixed">
          <CuboidCollider args={[0.3, 0.9, 0.6]} position={[0.7, 0.9, 3.2]} />
          <AssetMesh path="/assets/models/storage.shelf-unit.glb" position={[0.7, 0, 3.2]} rotation={[0, Math.PI / 2, 0]} />
        </RigidBody>
        <RigidBody type="fixed">
          <CuboidCollider args={[0.35, 0.45, 0.45]} position={[0.8, 0.45, 4.5]} />
          <AssetMesh path="/assets/models/utility.printer-cabinet.glb" position={[0.8, 0, 4.5]} rotation={[0, Math.PI / 2, 0]} />
        </RigidBody>

        {/* Phone Booth */}
        <RigidBody type="fixed">
          <CuboidCollider args={[0.55, 1.1, 0.55]} position={[11.2, 1.1, 6.0]} />
          <AssetMesh path="/assets/models/architecture.phone-booth.glb" position={[11.2, 0, 6.0]} />
        </RigidBody>

        {/* Standing Desk */}
        <RigidBody type="fixed">
          <CuboidCollider args={[0.7, 0.03, 0.38]} position={[9.5, 1.02, 8.2]} />
          <AssetMesh path="/assets/models/workstation.desk-standing.glb" position={[9.5, 0, 8.2]} />
          <AssetMesh path="/assets/models/tech.monitor-set.glb" position={[9.5, 1.05, 8.2]} />
        </RigidBody>

        {/* Lounge Sofa & Coffee Table */}
        <RigidBody type="fixed">
          <CuboidCollider args={[0.95, 0.38, 0.42]} position={[3.6, 0.38, 7.8]} />
          <AssetMesh path="/assets/models/seating.sofa-2p.glb" position={[3.6, 0, 7.8]} />
        </RigidBody>
        <RigidBody type="fixed">
          <CuboidCollider args={[0.42, 0.22, 0.42]} position={[3.6, 0.22, 8.5]} />
          <AssetMesh path="/assets/models/lounge.coffee-table.glb" position={[3.6, 0, 8.5]} />
        </RigidBody>

        {/* ============================================================== */}
        {/* STABLE DYNAMIC CHAIRS (Non-Overlapping Starting Positions)      */}
        {/* ============================================================== */}
        {/* 4-Person Workstation Chairs (South & North) */}
        <PhysicsChair path="/assets/models/seating.office-chair.glb" startPos={[4.3, 0.02, 4.65]} resetTrigger={physicsResetTrigger} />
        <PhysicsChair path="/assets/models/seating.office-chair.glb" startPos={[5.7, 0.02, 4.65]} resetTrigger={physicsResetTrigger} />
        <PhysicsChair path="/assets/models/seating.office-chair.glb" startPos={[4.3, 0.02, 2.95]} startRot={[0, Math.PI, 0]} resetTrigger={physicsResetTrigger} />
        <PhysicsChair path="/assets/models/seating.office-chair.glb" startPos={[5.7, 0.02, 2.95]} startRot={[0, Math.PI, 0]} resetTrigger={physicsResetTrigger} />

        {/* 2-Person Workstation Chairs */}
        <PhysicsChair path="/assets/models/seating.office-chair.glb" startPos={[4.3, 0.02, 6.55]} resetTrigger={physicsResetTrigger} />
        <PhysicsChair path="/assets/models/seating.office-chair.glb" startPos={[5.7, 0.02, 6.55]} resetTrigger={physicsResetTrigger} />

        {/* Focus Room & Standing Desk Chairs */}
        <PhysicsChair path="/assets/models/seating.office-chair.glb" startPos={[9.8, 0.02, 4.45]} resetTrigger={physicsResetTrigger} />
        <PhysicsChair path="/assets/models/seating.office-chair.glb" startPos={[9.5, 0.02, 8.85]} resetTrigger={physicsResetTrigger} />

        {/* Conference Room Meeting Chairs */}
        <PhysicsChair path="/assets/models/seating.meeting-chair.glb" startPos={[9.3, 0.02, 1.05]} resetTrigger={physicsResetTrigger} mass={8} />
        <PhysicsChair path="/assets/models/seating.meeting-chair.glb" startPos={[10.5, 0.02, 1.05]} resetTrigger={physicsResetTrigger} mass={8} />
        <PhysicsChair path="/assets/models/seating.meeting-chair.glb" startPos={[9.3, 0.02, 2.55]} startRot={[0, Math.PI, 0]} resetTrigger={physicsResetTrigger} mass={8} />
        <PhysicsChair path="/assets/models/seating.meeting-chair.glb" startPos={[10.5, 0.02, 2.55]} startRot={[0, Math.PI, 0]} resetTrigger={physicsResetTrigger} mass={8} />

        {/* Kitchen High Stool */}
        <PhysicsChair path="/assets/models/seating.stool-high.glb" startPos={[2.6, 0.02, 1.8]} resetTrigger={physicsResetTrigger} mass={6} colliderRadius={0.24} />

        {/* Lounge Armchair */}
        <PhysicsChair path="/assets/models/seating.lounge-chair.glb" startPos={[2.2, 0.02, 8.4]} startRot={[0, Math.PI / 4, 0]} resetTrigger={physicsResetTrigger} mass={18} colliderRadius={0.38} />

        {/* ============================================================== */}
        {/* INTERACTIVE PHYSICAL PROPS (Resting Stably on Desks)           */}
        {/* ============================================================== */}
        {propsList.map((p) => (
          <PhysicsProp key={p.id} prop={p} onClick={handlePropClick} />
        ))}

        {/* ============================================================== */}
        {/* PHYSICAL PLAYER CHARACTER (Alex Morgan)                        */}
        {/* ============================================================== */}
        <PhysicalPlayer
          route={route}
          playerPosition={playerPosition}
          resetTrigger={physicsResetTrigger}
        />

        {/* Teammate Jamie Lee (Physical Obstacle) */}
        <RigidBody type="fixed" position={[7.55, 0, 8.45]}>
          <CapsuleCollider args={[0.55, 0.28]} position={[0, 0.85, 0]} />
          <group position={[0, 0, 0]}>
            <mesh position={[0, 0.88, 0]} castShadow>
              <capsuleGeometry args={[0.25, 0.45, 4, 8]} />
              <meshStandardMaterial color="#b76f49" roughness={0.82} />
            </mesh>
            <mesh position={[0, 1.43, 0]} castShadow>
              <sphereGeometry args={[0.29, 12, 10]} />
              <meshStandardMaterial color="#e3b892" roughness={0.9} />
            </mesh>
          </group>
        </RigidBody>
      </Physics>

      {/* Architectural Visual Shell (Walls, Windows, Glass, Beams) */}
      {/* North City Window Wall + Drywall */}
      <AssetMesh path="/assets/models/architecture.window-city.glb" position={[3.2, 0, 0.08]} />
      <AssetMesh path="/assets/models/architecture.wall-straight.glb" position={[0.8, 0, 0.08]} />
      <AssetMesh path="/assets/models/architecture.wall-straight.glb" position={[5.8, 0, 0.08]} />
      <AssetMesh path="/assets/models/architecture.wall-corner.glb" position={[0.08, 0, 0.08]} />

      {/* West Wall Drywall */}
      <AssetMesh path="/assets/models/architecture.wall-straight.glb" position={[0.08, 0, 2.5]} rotation={[0, Math.PI / 2, 0]} />
      <AssetMesh path="/assets/models/architecture.wall-straight.glb" position={[0.08, 0, 5.0]} rotation={[0, Math.PI / 2, 0]} />
      <AssetMesh path="/assets/models/architecture.wall-straight.glb" position={[0.08, 0, 7.5]} rotation={[0, Math.PI / 2, 0]} />

      {/* East Wall Drywall */}
      <AssetMesh path="/assets/models/architecture.wall-straight.glb" position={[11.92, 0, 2.5]} rotation={[0, -Math.PI / 2, 0]} />
      <AssetMesh path="/assets/models/architecture.wall-straight.glb" position={[11.92, 0, 5.0]} rotation={[0, -Math.PI / 2, 0]} />
      <AssetMesh path="/assets/models/architecture.wall-straight.glb" position={[11.92, 0, 7.5]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Overhead Track Beams */}
      <AssetMesh path="/assets/models/architecture.ceiling-track.glb" position={[4.5, 2.3, 3.8]} />
      <AssetMesh path="/assets/models/architecture.ceiling-track.glb" position={[9.8, 2.3, 3.8]} />

      {/* Glass Panels */}
      <AssetMesh path="/assets/models/architecture.glass-panel.glb" position={[7.95, 0, 1.15]} rotation={[0, Math.PI / 2, 0]} />
      <AssetMesh path="/assets/models/architecture.glass-door.glb" position={[7.95, 0, 2.35]} rotation={[0, Math.PI / 2, 0]} />
      <AssetMesh path="/assets/models/architecture.glass-panel.glb" position={[7.95, 0, 3.10]} rotation={[0, Math.PI / 2, 0]} />
      <AssetMesh path="/assets/models/architecture.glass-panel.glb" position={[9.1, 0, 3.42]} />
      <AssetMesh path="/assets/models/architecture.glass-panel.glb" position={[10.7, 0, 3.42]} />
      <AssetMesh path="/assets/models/architecture.glass-panel.glb" position={[7.95, 0, 4.4]} rotation={[0, Math.PI / 2, 0]} />
      <AssetMesh path="/assets/models/architecture.glass-door.glb" position={[7.95, 0, 5.65]} rotation={[0, Math.PI / 2, 0]} />
      <AssetMesh path="/assets/models/architecture.glass-panel.glb" position={[7.95, 0, 6.55]} rotation={[0, Math.PI / 2, 0]} />
      <AssetMesh path="/assets/models/architecture.glass-panel.glb" position={[9.1, 0, 6.95]} />
      <AssetMesh path="/assets/models/architecture.glass-panel.glb" position={[10.7, 0, 6.95]} />

      {/* Interactive Wall Screens */}
      <AssetMesh path="/assets/models/tech.wall-screen.glb" position={[10.2, 1.25, 3.35]} onClick={() => onZone('customer')} />
      <AssetMesh path="/assets/models/tech.whiteboard.glb" position={[8.5, 0, 0.7]} rotation={[0, 0.2, 0]} />
      <AssetMesh path="/assets/models/tech.wall-screen.glb" position={[10.2, 1.25, 6.88]} onClick={() => onZone('project')} />

      {/* Greenery & Decor */}
      <AssetMesh path="/assets/models/greenery.plant-floor-a.glb" position={[3.3, 0, 3.2]} />
      <AssetMesh path="/assets/models/greenery.plant-large.glb" position={[6.7, 0, 6.0]} />
      <AssetMesh path="/assets/models/greenery.plant-large.glb" position={[1.4, 0, 7.5]} />
      <AssetMesh path="/assets/models/greenery.plant-floor-a.glb" position={[11.2, 0, 9.2]} />
      <AssetMesh path="/assets/models/lounge.rug.glb" position={[3.6, 0, 8.2]} />
      <AssetMesh path="/assets/models/storage.pedestal-drawer.glb" position={[10.9, 0, 8.2]} />

      {/* Cinematic Post-Processing Pipeline */}
      <EffectComposer multisampling={4}>
        <Bloom luminanceThreshold={0.88} intensity={0.45} mipmapBlur />
        <Vignette darkness={0.32} offset={0.5} />
      </EffectComposer>
    </Suspense>
  )
}
