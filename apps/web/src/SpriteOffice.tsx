import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useMemo } from 'react'
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

function IsometricSprite({
  texturePath,
  position,
  size,
  onClick,
}: {
  texturePath: string
  position: [number, number, number]
  size: [number, number]
  onClick?: () => void
}) {
  const texture = useMemo(() => {
    const t = new THREE.TextureLoader().load(texturePath)
    t.minFilter = THREE.LinearFilter
    t.magFilter = THREE.LinearFilter
    return t
  }, [texturePath])

  const w = size[0]
  const h = size[1]

  return (
    <group position={position} onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}>
      {/* Contact shadow on floor */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w * 0.9, w * 0.45]} />
        <meshBasicMaterial color="#1a2024" transparent opacity={0.25} />
      </mesh>
      {/* Vertical billboard sprite */}
      <mesh position={[0, h / 2, 0]} rotation={[-Math.PI / 5, Math.PI / 4, 0]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.4} side={THREE.DoubleSide} />
      </mesh>
    </group>
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
      }
    }
    body.current.position.y = walking ? Math.abs(Math.sin(clock.elapsedTime * 11)) * 0.035 : 0
    playerPosition.current = [body.current.position.x, body.current.position.z]
  })

  return (
    <group ref={body} position={[startPosition[0], 0, startPosition[1]]}>
      <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.34, 24]} />
        <meshBasicMaterial color="#23302c" transparent opacity={0.22} />
      </mesh>
      <mesh position={[0, 0.075, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.29, 0.34, 28]} />
        <meshBasicMaterial color={markerColor} transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 0.85, 0]}>
        <capsuleGeometry args={[0.24, 0.55, 4, 8]} />
        <meshStandardMaterial color={outfitColor} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.35, 0]}>
        <sphereGeometry args={[0.26, 12, 10]} />
        <meshStandardMaterial color="#e3b892" roughness={0.8} />
      </mesh>
    </group>
  )
}

export default function SpriteOffice({
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

      <ambientLight intensity={1.5} />
      <directionalLight position={[-5, 12, 7]} intensity={1.6} />
      <color attach="background" args={['#e8e6df']} />

      {/* Tiled Floor */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[6, -0.01, 5]}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          onMove([event.point.x, event.point.z])
        }}
      >
        <planeGeometry args={[WORLD.width, WORLD.depth]} />
        <meshStandardMaterial color="#d7d5ce" roughness={0.9} />
      </mesh>

      {showGrid && cells.map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.008, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[WORLD.cell * 0.94, WORLD.cell * 0.94]} />
          <meshBasicMaterial color="#5bb381" transparent opacity={0.25} />
        </mesh>
      ))}

      {/* ============================================================== */}
      {/* 2.5D ISOMETRIC SPRITE OBJECTS (Cutouts from reference sheets)   */}
      {/* ============================================================== */}
      {/* Open Workstations */}
      <IsometricSprite texturePath="/assets/sprites/desk_2p.png" position={[5.0, 0, 3.8]} size={[2.2, 1.4]} />
      <IsometricSprite texturePath="/assets/sprites/chair.png" position={[4.2, 0, 4.4]} size={[0.8, 1.1]} />
      <IsometricSprite texturePath="/assets/sprites/chair.png" position={[5.8, 0, 4.4]} size={[0.8, 1.1]} />
      <IsometricSprite texturePath="/assets/sprites/desk_2p.png" position={[5.0, 0, 6.0]} size={[2.2, 1.4]} />
      <IsometricSprite texturePath="/assets/sprites/chair.png" position={[4.2, 0, 6.6]} size={[0.8, 1.1]} />
      <IsometricSprite texturePath="/assets/sprites/chair.png" position={[5.8, 0, 6.6]} size={[0.8, 1.1]} />

      {/* Meeting Room */}
      <IsometricSprite texturePath="/assets/sprites/meeting_table.png" position={[10.0, 0, 1.8]} size={[2.4, 1.4]} onClick={() => onZone('customer')} />
      <IsometricSprite texturePath="/assets/sprites/whiteboard.png" position={[8.5, 0, 0.8]} size={[1.5, 1.3]} />

      {/* Kitchenette */}
      <IsometricSprite texturePath="/assets/sprites/kitchen.png" position={[1.5, 0, 1.0]} size={[2.6, 2.2]} />
      <IsometricSprite texturePath="/assets/sprites/shelf.png" position={[0.8, 0, 3.2]} size={[1.1, 1.8]} />

      {/* Lounge */}
      <IsometricSprite texturePath="/assets/sprites/sofa.png" position={[3.5, 0, 7.8]} size={[1.8, 1.1]} />
      <IsometricSprite texturePath="/assets/sprites/lounge_chair.png" position={[2.2, 0, 8.4]} size={[1.0, 1.1]} />

      {/* Plants & Pods */}
      <IsometricSprite texturePath="/assets/sprites/plant.png" position={[3.3, 0, 3.2]} size={[0.7, 1.0]} />
      <IsometricSprite texturePath="/assets/sprites/plant.png" position={[6.7, 0, 6.0]} size={[0.7, 1.0]} />
      <IsometricSprite texturePath="/assets/sprites/phone_booth.png" position={[11.2, 0, 6.0]} size={[1.2, 2.3]} onClick={() => onZone('project')} />

      {/* Avatars */}
      <Avatar route={route} playerPosition={playerPosition} />
      <Avatar route={[]} playerPosition={teammatePosition} startPosition={[7.55, 8.45]} outfitColor="#b76f49" markerColor="#cd9567" />
    </>
  )
}
