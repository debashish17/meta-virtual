import { Canvas, useThree, useFrame, ThreeEvent } from '@react-three/fiber'
import { useGLTF, OrbitControls } from '@react-three/drei'
import { Suspense, useState, useMemo, useRef, useEffect, useCallback } from 'react'
import * as THREE from 'three'
import {
  canonicalAssets,
  referenceAssets,
  REFERENCE_BOARDS,
  allAssets,
  AssetEntry,
} from './assets/assetManifest'

/** The parts of a review JSON (apps/web/public/assets/reviews/<asset>_review.json) this page reads. */
type RefineStep = {
  iteration: number; score: number; iou?: number; color?: number; verdict?: string
  comparison_image?: string; applied_adjustments?: string[]
}
type ReviewData = {
  overall_score: number; verdict?: string; asset_class: string; category?: string
  metrics: { component_completeness_percent?: number; silhouette_iou_percent?: number; color_fidelity_percent?: number }
  component_audit?: { component: string }[]
  critique?: string[]
  refinement_loop?: {
    total_iterations: number; converged: boolean; initial_score: number; final_score: number; score_delta: number
    iterations: RefineStep[]
  }
  identification_breakdown?: {
    what_it_is?: { display_name?: string; primary_function?: string }
    how_it_is?: {
      form_and_silhouette?: string; materials_and_finishes?: string; spatial_orientation_and_pose?: string
      structural_composition?: string; detected_visual_cues?: string[]
    }
  }
}

// Camera Controller with Isometric Pan, Zoom, and 360° View Angle Rotation
function CameraController({
  targetPoint,
  viewAngleDeg,
}: {
  targetPoint: [number, number, number]
  viewAngleDeg: number
}) {
  const { camera, gl } = useThree()
  const target = useRef(new THREE.Vector3(...targetPoint))

  // Update target point when center shifts
  useEffect(() => {
    target.current.set(...targetPoint)
  }, [targetPoint])

  // Update isometric camera position based on view angle and zoom
  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera
    const rad = (viewAngleDeg * Math.PI) / 180
    const dist = 28
    const elev = 35.26 * (Math.PI / 180)

    const cx = target.current.x + dist * Math.cos(rad) * Math.cos(elev)
    const cz = target.current.z + dist * Math.sin(rad) * Math.cos(elev)
    const cy = target.current.y + dist * Math.sin(elev)

    camera.position.set(cx, cy, cz)
    camera.lookAt(target.current)
    ortho.updateProjectionMatrix()
  }, [camera, viewAngleDeg])

  // Pan and Zoom listeners
  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera
    const canvas = gl.domElement
    let lastPoint: { x: number; y: number } | null = null

    const onDown = (event: PointerEvent) => {
      if (event.button !== 2 && event.button !== 1) return
      event.preventDefault()
      lastPoint = { x: event.clientX, y: event.clientY }
      canvas.setPointerCapture(event.pointerId)
    }

    const onMove = (event: PointerEvent) => {
      if (!lastPoint) return
      const dx = event.clientX - lastPoint.x
      const dy = event.clientY - lastPoint.y
      lastPoint = { x: event.clientX, y: event.clientY }

      const forward = new THREE.Vector3()
      camera.getWorldDirection(forward)
      forward.y = 0
      forward.normalize()

      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize()
      const worldPerPixel = 1 / ortho.zoom
      const delta = right.multiplyScalar(-dx * worldPerPixel).add(forward.multiplyScalar(dy * worldPerPixel))

      target.current.add(delta)
      camera.position.add(delta)
      camera.lookAt(target.current)
    }

    const onUp = () => { lastPoint = null }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      ortho.zoom = THREE.MathUtils.clamp(ortho.zoom * Math.exp(-event.deltaY * 0.001), 20, 110)
      ortho.updateProjectionMatrix()
    }

    const onContextMenu = (event: MouseEvent) => event.preventDefault()

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('contextmenu', onContextMenu)

    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContextMenu)
    }
  }, [camera, gl])

  return null
}

function AssetModel({ asset }: { asset: AssetEntry }) {
  const gltf = useGLTF(asset.model!)
  const scene = useMemo(() => {
    const s = gltf.scene.clone(true)
    s.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    return s
  }, [gltf.scene])
  return <primitive object={scene} />
}

function FootprintOutline({ w, d }: { w: number; d: number }) {
  const lineObj = useMemo(() => {
    const hw = w / 2
    const hd = d / 2
    const points = [
      new THREE.Vector3(-hw, 0.005, -hd),
      new THREE.Vector3(hw, 0.005, -hd),
      new THREE.Vector3(hw, 0.005, hd),
      new THREE.Vector3(-hw, 0.005, hd),
    ]
    const geo = new THREE.BufferGeometry().setFromPoints(points)
    const mat = new THREE.LineBasicMaterial({ color: '#2e7d32', linewidth: 2 })
    return new THREE.LineLoop(geo, mat)
  }, [w, d])

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial color="#4a7c59" transparent opacity={0.18} />
      </mesh>
      <primitive object={lineObj} />
    </group>
  )
}

function RotationGizmo({ radius, rotationY }: { radius: number; rotationY: number }) {
  const pointerObj = useMemo(() => {
    const pts = [
      new THREE.Vector3(0, 0.012, 0),
      new THREE.Vector3(0, 0.012, radius * 1.25),
    ]
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({ color: '#f59e0b', linewidth: 3 })
    return new THREE.Line(geo, mat)
  }, [radius])

  return (
    <group rotation={[0, rotationY, 0]}>
      {/* Outer Dial Ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
        <ringGeometry args={[radius * 0.95, radius * 1.05, 48]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.75} />
      </mesh>
      {/* Direction pointer */}
      <primitive object={pointerObj} />
      <mesh position={[0, 0.014, radius * 1.25]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.12, 16]} />
        <meshBasicMaterial color="#f59e0b" />
      </mesh>
    </group>
  )
}

function GalleryItem({
  asset,
  position,
  rotationY,
  isSelected,
  onSelect,
  isSpinningAll,
  isAutoRotateSelected,
  onRotateDelta,
}: {
  asset: AssetEntry
  position: [number, number, number]
  rotationY: number
  isSelected: boolean
  onSelect: () => void
  isSpinningAll: boolean
  isAutoRotateSelected: boolean
  onRotateDelta: (deltaRad: number) => void
}) {
  const rotGroupRef = useRef<THREE.Group>(null)
  const isDragging = useRef(false)
  const startX = useRef(0)

  // Smooth rotation update (turntable or manual)
  useFrame((_, delta) => {
    if (rotGroupRef.current) {
      if (isSpinningAll) {
        rotGroupRef.current.rotation.y += delta * 1.0
      } else if (isSelected && isAutoRotateSelected) {
        rotGroupRef.current.rotation.y += delta * 1.6
      } else {
        rotGroupRef.current.rotation.y = rotationY
      }
    }
  })

  const radius = Math.max(asset.footprint.w, asset.footprint.d) * 0.72

  return (
    <group
      position={position}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (e.button === 0) {
          e.stopPropagation()
          onSelect()
          isDragging.current = true
          startX.current = e.clientX
        }
      }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (isDragging.current && isSelected) {
          e.stopPropagation()
          const dx = e.clientX - startX.current
          startX.current = e.clientX
          onRotateDelta(dx * 0.02)
        }
      }}
      onPointerUp={() => { isDragging.current = false }}
      onPointerCancel={() => { isDragging.current = false }}
    >
      {/* Floor footprint outline */}
      <FootprintOutline w={asset.footprint.w} d={asset.footprint.d} />

      {/* Rotation Gizmo on Floor when selected */}
      {isSelected && <RotationGizmo radius={radius} rotationY={rotationY} />}

      {/* 3D Rotatable Model */}
      <group ref={rotGroupRef} rotation={[0, rotationY, 0]}>
        {asset.model && (
          <Suspense
            fallback={
              <mesh position={[0, asset.dimensionsM.h / 2, 0]}>
                <boxGeometry args={[asset.footprint.w, asset.dimensionsM.h, asset.footprint.d]} />
                <meshStandardMaterial color="#888" wireframe />
              </mesh>
            }
          >
            <AssetModel asset={asset} />
          </Suspense>
        )}
      </group>
    </group>
  )
}

function FloorGrid({ cols, rows, spacing }: { cols: number; rows: number; spacing: number }) {
  const totalW = cols * spacing + 6
  const totalD = rows * spacing + 6
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[((cols - 1) * spacing) / 2, -0.01, ((rows - 1) * spacing) / 2]} receiveShadow>
      <planeGeometry args={[totalW, totalD]} />
      <meshStandardMaterial color="#e5e2db" roughness={0.94} />
    </mesh>
  )
}

// Dedicated 3D Turntable Component in Inspector Sidebar
function TurntableModel({ modelPath }: { modelPath: string }) {
  const gltf = useGLTF(modelPath)
  const scene = useMemo(() => {
    const s = gltf.scene.clone(true)
    const box = new THREE.Box3().setFromObject(s)
    const size = new THREE.Vector3()
    box.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z, 0.001)
    const scale = 1.35 / maxDim
    s.scale.set(scale, scale, scale)

    box.setFromObject(s)
    const center = new THREE.Vector3()
    box.getCenter(center)
    s.position.x -= center.x
    s.position.z -= center.z
    s.position.y -= box.min.y
    return s
  }, [gltf.scene])

  return <primitive object={scene} />
}

function InspectorTurntable({
  asset,
  isAutoRotate,
  onToggleAutoRotate,
}: {
  asset: AssetEntry
  isAutoRotate: boolean
  onToggleAutoRotate: () => void
}) {
  return (
    <div style={{ width: '100%', height: 180, borderRadius: 6, overflow: 'hidden', background: '#181b20', position: 'relative' }}>
      <Canvas
        camera={{ position: [2.2, 1.8, 2.2], fov: 42 }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 5]} intensity={2.0} castShadow />
        <directionalLight position={[-4, 3, -4]} intensity={0.7} color="#bed4ff" />
        <color attach="background" args={['#181b20']} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
          <circleGeometry args={[1.6, 32]} />
          <meshStandardMaterial color="#262a33" roughness={0.8} />
        </mesh>

        {asset.model && (
          <Suspense fallback={null}>
            <TurntableModel modelPath={asset.model} />
          </Suspense>
        )}

        <OrbitControls
          makeDefault
          autoRotate={isAutoRotate}
          autoRotateSpeed={3.5}
          enablePan={false}
          minDistance={1.2}
          maxDistance={5.5}
          maxPolarAngle={Math.PI / 2 + 0.08}
        />
      </Canvas>
      <button
        onClick={onToggleAutoRotate}
        title="Toggle 360 Turntable Auto-Spin"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          background: isAutoRotate ? 'rgba(245, 158, 11, 0.9)' : 'rgba(0, 0, 0, 0.55)',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '3px 7px',
          fontSize: 10,
          fontWeight: 600,
          cursor: 'pointer',
          zIndex: 5,
        }}
      >
        {isAutoRotate ? '⏸ Turntable' : '▶ Spin 360°'}
      </button>
      <div style={{
        position: 'absolute',
        bottom: 6,
        right: 8,
        fontSize: 10,
        color: 'rgba(255,255,255,0.6)',
        pointerEvents: 'none',
        background: 'rgba(0,0,0,0.4)',
        padding: '2px 6px',
        borderRadius: 4,
      }}>
        🖱️ Drag to rotate 360° · Scroll zoom
      </div>
    </div>
  )
}

export default function AssetGallery() {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const initialBoard = urlParams.get('board') || 'all_ref'
  const initialCat = urlParams.get('category') || urlParams.get('cat') || 'all'

  // Catalog selection: 'all_ref' | 'canonical' | 'all' | 'pipeline_v2' | specific board name
  const [boardFilter, setBoardFilter] = useState<string>(initialBoard)
  const [categoryFilter, setCategoryFilter] = useState<string>(initialCat)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [currentPage, setCurrentPage] = useState<number>(1)
  const PAGE_SIZE = 36

  // Inspector Tab & Review Data state
  const initialTab = (urlParams.get('tab') as '3d' | 'audit') || (initialBoard === 'pipeline_v2' ? 'audit' : '3d')
  const [inspectorTab, setInspectorTab] = useState<'3d' | 'audit'>(initialTab)
  const [reviewData, setReviewData] = useState<ReviewData | null>(null)
  const [isLoadingReview, setIsLoadingReview] = useState<boolean>(true)
  const [selectedIteration, setSelectedIteration] = useState<number | null>(null)
  const [isRefining, setIsRefining] = useState<boolean>(false)
  const [refineFeedback, setRefineFeedback] = useState<string | null>(null)

  const PIPELINE_V2_ASSET_IDS = useMemo(() => ["ref.doors__entries___window_views_asset_sheet_12", "ref.doors__entries___window_views_asset_sheet_13", "ref.doors__entries___window_views_asset_sheet_14", "ref.doors__entries___window_views_asset_sheet_15", "ref.doors__entries___window_views_asset_sheet_16", "ref.doors__entries___window_views_asset_sheet_17", "ref.doors__entries___window_views_asset_sheet_18", "ref.doors__entries___window_views_asset_sheet_19", "ref.doors__entries___window_views_asset_sheet_20", "ref.doors__entries___window_views_asset_sheet_21", "ref.doors__entries___window_views_asset_sheet_22", "ref.doors__entries___window_views_asset_sheet_23", "ref.doors__entries___window_views_asset_sheet_24", "ref.doors__entries___window_views_asset_sheet_25", "ref.doors__entries___window_views_asset_sheet_27", "ref.doors__entries___window_views_asset_sheet_28", "ref.doors__entries___window_views_asset_sheet_29", "ref.doors__entries___window_views_asset_sheet_30", "ref.doors__entries___window_views_asset_sheet_31", "ref.doors__entries___window_views_asset_sheet_32", "ref.doors__entries___window_views_asset_sheet_33", "ref.doors__entries___window_views_asset_sheet_34", "ref.doors__entries___window_views_asset_sheet_35", "ref.doors__entries___window_views_asset_sheet_37", "ref.doors__entries___window_views_asset_sheet_40", "ref.doors__entries___window_views_asset_sheet_41", "ref.doors__entries___window_views_asset_sheet_42", "ref.doors__entries___window_views_asset_sheet_43", "ref.doors__entries___window_views_asset_sheet_44", "ref.doors__entries___window_views_asset_sheet_45", "ref.doors__entries___window_views_asset_sheet_46", "ref.doors__entries___window_views_asset_sheet_47", "ref.doors__entries___window_views_asset_sheet_48", "ref.doors__entries___window_views_asset_sheet_49", "ref.doors__entries___window_views_asset_sheet_50", "ref.doors__entries___window_views_asset_sheet_51", "ref.doors__entries___window_views_asset_sheet_52", "ref.doors__entries___window_views_asset_sheet_53", "ref.doors__entries___window_views_asset_sheet_54", "ref.doors__entries___window_views_asset_sheet_57", "ref.isometric_modern_office_kit_00", "ref.isometric_modern_office_kit_01", "ref.isometric_modern_office_kit_02", "ref.isometric_modern_office_kit_03", "ref.isometric_modern_office_kit_04", "ref.isometric_modern_office_kit_05", "ref.isometric_modern_office_kit_06", "ref.isometric_modern_office_kit_07", "ref.isometric_modern_office_kit_08", "ref.isometric_modern_office_kit_09", "ref.isometric_modern_office_kit_10", "ref.isometric_modern_office_kit_11", "ref.isometric_modern_office_kit_12", "ref.isometric_modern_office_kit_13", "ref.isometric_modern_office_kit_14", "ref.isometric_modern_office_kit_15", "ref.isometric_modern_office_kit_16", "ref.isometric_modern_office_kit_17", "ref.isometric_modern_office_kit_18", "ref.isometric_modern_office_kit_19", "ref.isometric_modern_office_kit_20", "ref.isometric_modern_office_kit_21", "ref.isometric_workstation_variations_guide_06", "ref.isometric_workstation_variations_guide_07", "ref.isometric_workstation_variations_guide_08", "ref.isometric_workstation_variations_guide_09", "ref.isometric_workstation_variations_guide_10", "ref.isometric_workstation_variations_guide_11", "ref.isometric_workstation_variations_guide_13", "ref.isometric_workstation_variations_guide_14", "ref.isometric_workstation_variations_guide_15", "ref.isometric_workstation_variations_guide_16", "ref.isometric_workstation_variations_guide_17", "ref.isometric_workstation_variations_guide_18", "ref.isometric_workstation_variations_guide_19", "ref.isometric_workstation_variations_guide_21", "ref.isometric_workstation_variations_guide_23", "ref.isometric_workstation_variations_guide_24", "ref.isometric_workstation_variations_guide_25", "ref.isometric_workstation_variations_guide_26", "ref.isometric_workstation_variations_guide_27", "ref.isometric_workstation_variations_guide_29", "ref.isometric_workstation_variations_guide_30", "ref.isometric_workstation_variations_guide_31", "ref.isometric_workstation_variations_guide_32", "ref.isometric_workstation_variations_guide_33", "ref.isometric_workstation_variations_guide_34", "ref.isometric_workstation_variations_guide_35", "ref.isometric_workstation_variations_guide_40", "ref.isometric_workstation_variations_guide_41", "ref.isometric_workstation_variations_guide_44", "ref.isometric_workstation_variations_guide_45", "ref.isometric_workstation_variations_guide_47", "ref.isometric_workstation_variations_guide_49", "ref.isometric_workstation_variations_guide_50", "ref.isometric_workstation_variations_guide_51", "ref.isometric_workstation_variations_guide_52", "ref.isometric_workstation_variations_guide_54", "ref.isometric_workstation_variations_guide_55", "ref.meeting_rooms___private_spaces_catalog_12", "ref.meeting_rooms___private_spaces_catalog_13", "ref.meeting_rooms___private_spaces_catalog_14", "ref.meeting_rooms___private_spaces_catalog_15", "ref.meeting_rooms___private_spaces_catalog_16", "ref.meeting_rooms___private_spaces_catalog_17", "ref.meeting_rooms___private_spaces_catalog_18", "ref.meeting_rooms___private_spaces_catalog_19", "ref.meeting_rooms___private_spaces_catalog_20", "ref.meeting_rooms___private_spaces_catalog_21", "ref.meeting_rooms___private_spaces_catalog_22", "ref.meeting_rooms___private_spaces_catalog_23", "ref.meeting_rooms___private_spaces_catalog_25", "ref.meeting_rooms___private_spaces_catalog_26", "ref.meeting_rooms___private_spaces_catalog_27", "ref.meeting_rooms___private_spaces_catalog_28", "ref.meeting_rooms___private_spaces_catalog_29", "ref.meeting_rooms___private_spaces_catalog_30", "ref.meeting_rooms___private_spaces_catalog_35", "ref.meeting_rooms___private_spaces_catalog_36", "ref.meeting_rooms___private_spaces_catalog_37", "ref.meeting_rooms___private_spaces_catalog_38", "ref.meeting_rooms___private_spaces_catalog_40", "ref.meeting_rooms___private_spaces_catalog_41", "ref.meeting_rooms___private_spaces_catalog_42", "ref.meeting_rooms___private_spaces_catalog_43", "ref.meeting_rooms___private_spaces_catalog_44", "ref.meeting_rooms___private_spaces_catalog_45", "ref.meeting_rooms___private_spaces_catalog_46", "ref.meeting_rooms___private_spaces_catalog_47", "ref.meeting_rooms___private_spaces_catalog_61", "ref.meeting_rooms___private_spaces_catalog_62", "ref.meeting_rooms___private_spaces_catalog_63", "ref.meeting_rooms___private_spaces_catalog_64", "ref.meeting_rooms___private_spaces_catalog_65", "ref.meeting_rooms___private_spaces_catalog_66", "ref.meeting_rooms___private_spaces_catalog_67", "ref.meeting_rooms___private_spaces_catalog_68", "ref.meeting_rooms___private_spaces_catalog_69", "ref.meeting_rooms___private_spaces_catalog_70", "ref.meeting_rooms___private_spaces_catalog_71", "ref.meeting_rooms___private_spaces_catalog_72", "ref.meeting_rooms___private_spaces_catalog_73", "ref.meeting_rooms___private_spaces_catalog_74", "ref.meeting_rooms___private_spaces_catalog_76", "ref.modern_office_asset_library_board_00", "ref.modern_office_asset_library_board_01", "ref.modern_office_asset_library_board_02", "ref.modern_office_asset_library_board_03", "ref.modern_office_asset_library_board_04", "ref.modern_office_asset_library_board_05", "ref.modern_office_asset_library_board_06", "ref.modern_office_asset_library_board_07", "ref.modern_office_asset_library_board_08", "ref.modern_office_asset_library_board_09", "ref.modern_office_asset_library_board_10", "ref.modern_office_asset_library_board_11", "ref.modern_office_asset_library_board_12", "ref.modern_office_asset_library_board_13", "ref.modern_office_asset_library_board_14", "ref.modern_office_asset_library_board_15", "ref.modern_office_asset_library_board_16", "ref.modern_office_asset_library_board_17", "ref.modern_office_asset_library_board_18", "ref.modern_office_asset_library_board_19", "ref.modern_office_asset_library_board_23", "ref.modern_office_asset_library_board_24", "ref.modern_office_asset_library_board_25", "ref.modern_office_asset_library_board_26", "ref.modern_office_asset_library_board_27", "ref.modern_office_asset_library_board_28", "ref.modern_office_asset_library_board_29", "ref.modern_office_asset_library_board_30", "ref.modern_office_asset_library_board_32", "ref.modern_office_asset_library_board_33", "ref.modern_office_asset_library_board_34", "ref.modern_office_asset_library_board_35", "ref.modern_office_asset_library_board_36", "ref.modern_office_asset_library_board_37", "ref.modern_office_asset_library_board_38", "ref.modern_office_asset_library_board_40", "ref.modern_office_asset_library_board_41", "ref.modern_office_asset_library_board_43", "ref.modern_office_asset_library_board_46", "ref.modern_office_asset_library_board_47", "ref.modern_office_asset_library_board_52", "ref.modern_office_asset_library_board_53", "ref.modern_office_asset_library_board_54", "ref.modern_office_kitchenette_asset_board_02", "ref.modern_office_kitchenette_asset_board_10", "ref.modern_office_kitchenette_asset_board_11", "ref.modern_office_kitchenette_asset_board_12", "ref.modern_office_kitchenette_asset_board_13", "ref.modern_office_kitchenette_asset_board_14", "ref.modern_office_kitchenette_asset_board_18", "ref.modern_office_kitchenette_asset_board_19", "ref.modern_office_kitchenette_asset_board_20", "ref.modern_office_kitchenette_asset_board_21", "ref.modern_office_kitchenette_asset_board_22", "ref.modern_office_kitchenette_asset_board_23", "ref.modern_office_kitchenette_asset_board_24", "ref.modern_office_kitchenette_asset_board_25", "ref.modern_office_kitchenette_asset_board_26", "ref.modern_office_kitchenette_asset_board_30", "ref.modern_office_kitchenette_asset_board_31", "ref.modern_office_kitchenette_asset_board_32", "ref.modern_office_kitchenette_asset_board_33", "ref.modern_office_kitchenette_asset_board_39", "ref.modern_office_kitchenette_asset_board_40", "ref.modern_office_kitchenette_asset_board_41", "ref.modern_office_kitchenette_asset_board_42", "ref.modern_office_kitchenette_asset_board_43", "ref.modern_office_kitchenette_asset_board_44", "ref.modern_office_kitchenette_asset_board_45", "ref.modern_office_kitchenette_asset_board_46", "ref.modern_office_kitchenette_asset_board_47", "ref.modern_office_kitchenette_asset_board_48", "ref.modern_office_kitchenette_asset_board_49", "ref.modern_office_kitchenette_asset_board_58", "ref.modern_office_kitchenette_asset_board_59", "ref.modern_office_kitchenette_asset_board_60", "ref.modern_office_kitchenette_asset_board_61", "ref.modern_office_kitchenette_asset_board_62", "ref.modern_office_kitchenette_asset_board_63", "ref.modern_office_kitchenette_asset_board_64", "ref.modern_office_kitchenette_asset_board_65", "ref.modern_office_kitchenette_asset_board_68", "ref.modern_office_kitchenette_asset_board_69", "ref.modern_office_kitchenette_asset_board_70", "ref.modern_office_kitchenette_asset_board_72", "ref.modern_office_kitchenette_asset_board_74", "ref.office_lounge_seating_reference_board_04", "ref.office_lounge_seating_reference_board_11", "ref.office_lounge_seating_reference_board_12", "ref.office_lounge_seating_reference_board_13", "ref.office_lounge_seating_reference_board_14", "ref.office_lounge_seating_reference_board_15", "ref.office_lounge_seating_reference_board_16", "ref.office_lounge_seating_reference_board_17", "ref.office_lounge_seating_reference_board_20", "ref.office_lounge_seating_reference_board_21", "ref.office_lounge_seating_reference_board_22", "ref.office_lounge_seating_reference_board_23", "ref.office_lounge_seating_reference_board_25", "ref.office_lounge_seating_reference_board_26", "ref.office_lounge_seating_reference_board_27", "ref.office_lounge_seating_reference_board_28", "ref.office_lounge_seating_reference_board_29", "ref.office_lounge_seating_reference_board_30", "ref.office_lounge_seating_reference_board_32", "ref.office_lounge_seating_reference_board_39", "ref.office_lounge_seating_reference_board_40", "ref.office_lounge_seating_reference_board_41", "ref.office_lounge_seating_reference_board_42", "ref.office_lounge_seating_reference_board_43", "ref.office_lounge_seating_reference_board_44", "ref.office_lounge_seating_reference_board_45", "ref.office_lounge_seating_reference_board_46", "ref.office_lounge_seating_reference_board_50", "ref.office_lounge_seating_reference_board_51", "ref.office_lounge_seating_reference_board_52", "ref.office_lounge_seating_reference_board_53", "ref.office_lounge_seating_reference_board_55", "ref.office_lounge_seating_reference_board_56", "ref.office_lounge_seating_reference_board_57", "ref.office_lounge_seating_reference_board_58", "ref.office_lounge_seating_reference_board_65", "ref.office_lounge_seating_reference_board_66", "ref.office_lounge_seating_reference_board_68", "ref.office_lounge_seating_reference_board_69", "ref.office_lounge_seating_reference_board_70", "ref.office_lounge_seating_reference_board_71", "ref.office_lounge_seating_reference_board_73", "ref.office_lounge_seating_reference_board_74", "ref.office_lounge_seating_reference_board_75", "ref.office_lounge_seating_reference_board_76", "ref.office_storage___organization_asset_sheet_11", "ref.office_storage___organization_asset_sheet_12", "ref.office_storage___organization_asset_sheet_13", "ref.office_storage___organization_asset_sheet_14", "ref.office_storage___organization_asset_sheet_15", "ref.office_storage___organization_asset_sheet_16", "ref.office_storage___organization_asset_sheet_17", "ref.office_storage___organization_asset_sheet_18", "ref.office_storage___organization_asset_sheet_19", "ref.office_storage___organization_asset_sheet_20", "ref.office_storage___organization_asset_sheet_21", "ref.office_storage___organization_asset_sheet_33", "ref.office_storage___organization_asset_sheet_34", "ref.office_storage___organization_asset_sheet_35", "ref.office_storage___organization_asset_sheet_36", "ref.office_storage___organization_asset_sheet_37", "ref.office_storage___organization_asset_sheet_38", "ref.office_storage___organization_asset_sheet_39", "ref.office_storage___organization_asset_sheet_40", "ref.office_storage___organization_asset_sheet_41", "ref.office_storage___organization_asset_sheet_42", "ref.office_storage___organization_asset_sheet_43", "ref.office_storage___organization_asset_sheet_44", "ref.office_storage___organization_asset_sheet_58", "ref.office_storage___organization_asset_sheet_59", "ref.office_storage___organization_asset_sheet_60", "ref.office_storage___organization_asset_sheet_61", "ref.office_storage___organization_asset_sheet_62", "ref.office_storage___organization_asset_sheet_64", "ref.office_storage___organization_asset_sheet_65", "ref.office_storage___organization_asset_sheet_66", "ref.office_storage___organization_asset_sheet_67", "ref.office_storage___organization_asset_sheet_77", "ref.office_storage___organization_asset_sheet_78", "ref.office_storage___organization_asset_sheet_79", "ref.office_storage___organization_asset_sheet_80", "ref.office_storage___organization_asset_sheet_81", "ref.office_storage___organization_asset_sheet_83", "ref.office_storage___organization_asset_sheet_84", "ref.office_storage___organization_asset_sheet_87", "ref.office_storage___organization_asset_sheet_89", "ref.office_storage___organization_asset_sheet_91", "ref.office_storage___organization_asset_sheet_92", "ref.office_storage___organization_asset_sheet_93", "ref.partitions___dividers_asset_catalog_03", "ref.partitions___dividers_asset_catalog_10", "ref.partitions___dividers_asset_catalog_100", "ref.partitions___dividers_asset_catalog_101", "ref.partitions___dividers_asset_catalog_102", "ref.partitions___dividers_asset_catalog_106", "ref.partitions___dividers_asset_catalog_11", "ref.partitions___dividers_asset_catalog_12", "ref.partitions___dividers_asset_catalog_13", "ref.partitions___dividers_asset_catalog_14", "ref.partitions___dividers_asset_catalog_15", "ref.partitions___dividers_asset_catalog_16", "ref.partitions___dividers_asset_catalog_17", "ref.partitions___dividers_asset_catalog_18", "ref.partitions___dividers_asset_catalog_19", "ref.partitions___dividers_asset_catalog_20", "ref.partitions___dividers_asset_catalog_33", "ref.partitions___dividers_asset_catalog_34", "ref.partitions___dividers_asset_catalog_35", "ref.partitions___dividers_asset_catalog_36", "ref.partitions___dividers_asset_catalog_37", "ref.partitions___dividers_asset_catalog_38", "ref.partitions___dividers_asset_catalog_39", "ref.partitions___dividers_asset_catalog_40", "ref.partitions___dividers_asset_catalog_41", "ref.partitions___dividers_asset_catalog_42", "ref.partitions___dividers_asset_catalog_43", "ref.partitions___dividers_asset_catalog_55", "ref.partitions___dividers_asset_catalog_56", "ref.partitions___dividers_asset_catalog_57", "ref.partitions___dividers_asset_catalog_58", "ref.partitions___dividers_asset_catalog_59", "ref.partitions___dividers_asset_catalog_60", "ref.partitions___dividers_asset_catalog_61", "ref.partitions___dividers_asset_catalog_62", "ref.partitions___dividers_asset_catalog_63", "ref.partitions___dividers_asset_catalog_64", "ref.partitions___dividers_asset_catalog_65", "ref.partitions___dividers_asset_catalog_75", "ref.partitions___dividers_asset_catalog_76", "ref.partitions___dividers_asset_catalog_77", "ref.partitions___dividers_asset_catalog_78", "ref.partitions___dividers_asset_catalog_79", "ref.partitions___dividers_asset_catalog_80", "ref.partitions___dividers_asset_catalog_81", "ref.partitions___dividers_asset_catalog_82", "ref.partitions___dividers_asset_catalog_83", "ref.partitions___dividers_asset_catalog_84", "ref.partitions___dividers_asset_catalog_94", "ref.partitions___dividers_asset_catalog_95", "ref.partitions___dividers_asset_catalog_96", "ref.partitions___dividers_asset_catalog_97", "ref.presentation___tech_asset_catalog_09", "ref.presentation___tech_asset_catalog_10", "ref.presentation___tech_asset_catalog_104", "ref.presentation___tech_asset_catalog_105", "ref.presentation___tech_asset_catalog_11", "ref.presentation___tech_asset_catalog_12", "ref.presentation___tech_asset_catalog_13", "ref.presentation___tech_asset_catalog_14", "ref.presentation___tech_asset_catalog_24", "ref.presentation___tech_asset_catalog_25", "ref.presentation___tech_asset_catalog_26", "ref.presentation___tech_asset_catalog_27", "ref.presentation___tech_asset_catalog_28", "ref.presentation___tech_asset_catalog_29", "ref.presentation___tech_asset_catalog_30", "ref.presentation___tech_asset_catalog_31", "ref.presentation___tech_asset_catalog_47", "ref.presentation___tech_asset_catalog_48", "ref.presentation___tech_asset_catalog_49", "ref.presentation___tech_asset_catalog_50", "ref.presentation___tech_asset_catalog_51", "ref.presentation___tech_asset_catalog_52", "ref.presentation___tech_asset_catalog_54", "ref.presentation___tech_asset_catalog_55", "ref.presentation___tech_asset_catalog_56", "ref.presentation___tech_asset_catalog_57", "ref.presentation___tech_asset_catalog_58", "ref.presentation___tech_asset_catalog_70", "ref.presentation___tech_asset_catalog_71", "ref.presentation___tech_asset_catalog_75", "ref.print___utility_office_asset_library_03", "ref.print___utility_office_asset_library_07", "ref.print___utility_office_asset_library_12", "ref.print___utility_office_asset_library_13", "ref.print___utility_office_asset_library_14", "ref.print___utility_office_asset_library_15", "ref.print___utility_office_asset_library_16", "ref.print___utility_office_asset_library_17", "ref.print___utility_office_asset_library_18", "ref.print___utility_office_asset_library_19", "ref.print___utility_office_asset_library_29", "ref.print___utility_office_asset_library_30", "ref.print___utility_office_asset_library_31", "ref.print___utility_office_asset_library_33", "ref.print___utility_office_asset_library_34", "ref.print___utility_office_asset_library_35", "ref.print___utility_office_asset_library_36", "ref.print___utility_office_asset_library_37", "ref.print___utility_office_asset_library_38", "ref.print___utility_office_asset_library_39", "ref.print___utility_office_asset_library_41", "ref.print___utility_office_asset_library_42", "ref.print___utility_office_asset_library_43", "ref.print___utility_office_asset_library_54", "ref.print___utility_office_asset_library_56", "ref.print___utility_office_asset_library_57", "ref.print___utility_office_asset_library_58", "ref.print___utility_office_asset_library_59", "ref.print___utility_office_asset_library_60", "ref.print___utility_office_asset_library_61", "ref.print___utility_office_asset_library_63", "ref.print___utility_office_asset_library_64", "ref.print___utility_office_asset_library_65", "ref.print___utility_office_asset_library_85", "ref.print___utility_office_asset_library_86", "ref.print___utility_office_asset_library_90", "ref.print___utility_office_asset_library_91"], [])

  // Viewpoint Angle: 45° (SW), 135° (SE), 225° (NE), 315° (NW)
  const [viewAngleDeg, setViewAngleDeg] = useState<number>(45)

  // Rotation states
  const [assetRotations, setAssetRotations] = useState<Record<string, number>>(() => {
    const r = Number(urlParams.get('rot')) || 0
    const initMap: Record<string, number> = {}
    if (r !== 0) {
      initMap['__initial'] = (r * Math.PI) / 180
    }
    return initMap
  })
  const [isSpinAll, setIsSpinAll] = useState<boolean>(false)
  const [isAutoRotateSelected, setIsAutoRotateSelected] = useState<boolean>(false)
  const [isInspectorAutoSpin, setIsInspectorAutoSpin] = useState<boolean>(true)

  // Match dropdown value
  const selectedDropdownValue = useMemo(() => {
    if (boardFilter === 'all_ref' || boardFilter === 'canonical' || boardFilter === 'all' || boardFilter === 'pipeline_v2') {
      return boardFilter
    }
    const match = REFERENCE_BOARDS.find((b) => b.name.toLowerCase().includes(boardFilter.toLowerCase()))
    return match ? match.name : 'all_ref'
  }, [boardFilter])

  // Base list based on boardFilter
  const baseAssets = useMemo(() => {
    if (boardFilter === 'pipeline_v2') {
      return referenceAssets.filter((a) => PIPELINE_V2_ASSET_IDS.includes(a.id))
    }
    if (boardFilter === 'canonical') return canonicalAssets
    if (boardFilter === 'all_ref') return referenceAssets
    if (boardFilter === 'all') return allAssets
    // Filter by specific board name
    return referenceAssets.filter(
      (a) => a.sourceBoard.toLowerCase().includes(boardFilter.toLowerCase())
    )
  }, [boardFilter, PIPELINE_V2_ASSET_IDS])

  // Filtered by category & search
  const filteredAssets = useMemo(() => {
    let list = baseAssets
    if (categoryFilter !== 'all') {
      list = list.filter((a) => a.category === categoryFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q))
    }
    return list
  }, [baseAssets, categoryFilter, searchQuery])

  // Pagination for high FPS
  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / PAGE_SIZE))
  const paginatedAssets = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredAssets.slice(start, start + PAGE_SIZE)
  }, [filteredAssets, currentPage, PAGE_SIZE])

  // Selected asset state
  const initialAssetId = urlParams.get('id') || (urlParams.get('asset') ? ('ref.' + urlParams.get('asset')) : '')
  const [selectedId, setSelectedId] = useState<string>(initialAssetId || paginatedAssets[0]?.id || '')
  useEffect(() => {
    if (initialAssetId && baseAssets.some((a) => a.id === initialAssetId)) {
      setSelectedId(initialAssetId)
      return
    }
    if (paginatedAssets.length > 0 && !paginatedAssets.some((a) => a.id === selectedId)) {
      setSelectedId(paginatedAssets[0].id)
    }
  }, [paginatedAssets, selectedId])

  const selectedAsset = useMemo(() => {
    return filteredAssets.find((a) => a.id === selectedId) || paginatedAssets[0] || canonicalAssets[0]
  }, [filteredAssets, paginatedAssets, selectedId])

  // Fetch reviewer agent audit data if available for selected asset
  useEffect(() => {
    setSelectedIteration(null)
    setRefineFeedback(null)
    if (!selectedAsset) {
      setReviewData(null)
      setIsLoadingReview(false)
      return
    }
    setIsLoadingReview(true)
    const stem = selectedAsset.id.replace('ref.', '')
    fetch('/assets/reviews/' + stem + '_review.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setReviewData(d)
        setIsLoadingReview(false)
      })
      .catch(() => {
        setReviewData(null)
        setIsLoadingReview(false)
      })
  }, [selectedAsset])

  // Active iteration step data if refinement loop is present
  const refinementLoop = reviewData?.refinement_loop
  const activeStep = useMemo(() => {
    if (!refinementLoop?.iterations?.length) return null
    if (selectedIteration === null) {
      return refinementLoop.iterations[refinementLoop.iterations.length - 1]
    }
    return refinementLoop.iterations[selectedIteration] || refinementLoop.iterations[0]
  }, [refinementLoop, selectedIteration])

  // Active comparison image URL
  const comparisonImageUrl = useMemo(() => {
    if (!selectedAsset) return ''
    const stem = selectedAsset.id.replace('ref.', '')
    if (activeStep?.comparison_image) {
      return activeStep.comparison_image
    }
    return '/assets/comparisons/' + stem + '_comparison.png'
  }, [selectedAsset, activeStep])

  // Active display score and metrics
  const displayScore = activeStep ? activeStep.score : reviewData?.overall_score
  const displayVerdict = activeStep ? activeStep.verdict : reviewData?.verdict
  const displayIoU = activeStep ? activeStep.iou : reviewData?.metrics?.silhouette_iou_percent
  const displayColor = activeStep ? activeStep.color : reviewData?.metrics?.color_fidelity_percent

  // Handler to run looping refiner agent on selected asset
  const handleRunRefinerLoop = useCallback(async () => {
    if (!selectedAsset || isRefining) return
    setIsRefining(true)
    setRefineFeedback('🤖 Refiner Agent is iteratively analyzing errors, mutating geometry in Blender, and re-auditing...')
    try {
      const resp = await fetch('http://localhost:2567/api/refine_asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_id: selectedAsset.id }),
      })
      const data = await resp.json()
      if (data.ok && data.review) {
        setReviewData(data.review)
        setSelectedIteration(null)
        setRefineFeedback('✨ Refinement complete! Score improved to ' + data.review.overall_score + '% (' + data.review.verdict + ')')
      } else {
        setRefineFeedback('Refinement ended: ' + (data.error || 'Check server logs'))
      }
    } catch (err) {
      setRefineFeedback('Error running refiner: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setIsRefining(false)
    }
  }, [selectedAsset, isRefining])


  // Selected asset rotation angle in radians and degrees
  const currentRotationRad = assetRotations[selectedAsset?.id || ''] ?? (assetRotations['__initial'] || 0)
  const currentRotationDeg = Math.round(((currentRotationRad * 180) / Math.PI) % 360)
  const normalizedDeg = (currentRotationDeg + 360) % 360

  // Rotation modifier handlers
  const rotateSelectedBy = useCallback((deltaRad: number) => {
    if (!selectedAsset) return
    setAssetRotations((prev) => {
      const current = prev[selectedAsset.id] || 0
      return { ...prev, [selectedAsset.id]: (current + deltaRad) % (2 * Math.PI) }
    })
  }, [selectedAsset])

  const setExactRotationDeg = useCallback((deg: number) => {
    if (!selectedAsset) return
    const rad = (deg * Math.PI) / 180
    setAssetRotations((prev) => ({ ...prev, [selectedAsset.id]: rad }))
  }, [selectedAsset])

  // Keyboard controls: [Q] / [E] to rotate selected asset, [Space] to toggle spin
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'q' || e.key === 'Q') {
        rotateSelectedBy(-Math.PI / 4)
      } else if (e.key === 'e' || e.key === 'E') {
        rotateSelectedBy(Math.PI / 4)
      } else if (e.key === 'r' || e.key === 'R') {
        setExactRotationDeg(0)
      } else if (e.key === ' ') {
        e.preventDefault()
        setIsAutoRotateSelected((v) => !v)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [rotateSelectedBy, setExactRotationDeg])

  // Grid layout
  const COLS = 6
  const SPACING = 3.2
  const rows = Math.ceil(paginatedAssets.length / COLS)
  const centerTarget: [number, number, number] = [((COLS - 1) * SPACING) / 2, 0, ((rows - 1) * SPACING) / 2]

  const assetPositions = useMemo(() => {
    return paginatedAssets.map((asset, idx) => {
      const col = idx % COLS
      const row = Math.floor(idx / COLS)
      return {
        asset,
        position: [col * SPACING, 0, row * SPACING] as [number, number, number],
      }
    })
  }, [paginatedAssets, COLS, SPACING])

  return (
    <main className="app-shell" style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#dcd8cf' }}>
      {/* 3D Scene Layer */}
      <div className="scene-layer" style={{ width: '100%', height: '100%' }}>
        <Canvas
          orthographic
          shadows
          dpr={[1, 1.5]}
          camera={{
            position: [24, 18, 24],
            zoom: 38,
            near: 0.1,
            far: 180,
          }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <CameraController targetPoint={centerTarget} viewAngleDeg={viewAngleDeg} />
          <ambientLight intensity={0.65} />
          <hemisphereLight args={['#fff9ec', '#81867f', 1.8]} />
          <directionalLight
            position={[-12, 24, 12]}
            intensity={2.6}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-bias={-0.0001}
            shadow-camera-left={-30}
            shadow-camera-right={30}
            shadow-camera-top={30}
            shadow-camera-bottom={-30}
          />
          <directionalLight position={[12, 16, -12]} intensity={0.8} color="#e0e8ff" />
          <color attach="background" args={['#dcd8cf']} />

          <FloorGrid cols={COLS} rows={rows} spacing={SPACING} />

          {assetPositions.map(({ asset, position }) => (
            <GalleryItem
              key={asset.id}
              asset={asset}
              position={position}
              rotationY={assetRotations[asset.id] ?? (asset.id === selectedId ? (assetRotations['__initial'] || 0) : 0)}
              isSelected={asset.id === selectedId}
              onSelect={() => setSelectedId(asset.id)}
              isSpinningAll={isSpinAll}
              isAutoRotateSelected={isAutoRotateSelected}
              onRotateDelta={rotateSelectedBy}
            />
          ))}
        </Canvas>
      </div>

      {/* Top Header & Navigation Bar */}
      <header
        className="glass-panel"
        style={{
          position: 'absolute',
          top: 68,
          left: 14,
          right: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: '12px 18px',
          background: 'rgba(255, 255, 255, 0.88)',
          backdropFilter: 'blur(16px)',
          borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          zIndex: 10,
        }}
      >
        {/* Row 1: Title, View Angle Controls, Spin All, Return Link */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#4caf50' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#1c1e22' }}>
                Virtual Office — 3D Reference Asset Gallery
              </div>
              <div style={{ fontSize: 11, color: '#666' }}>
                {filteredAssets.length} Total Assets · Rotatable 3D Models · Metric Meter Scale
              </div>
            </div>
          </div>

          {/* Center: View Rotation & Global Turntable Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#e9e6df', padding: '4px 10px', borderRadius: 20 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#555' }}>CAMERA VIEW:</span>
            <button
              onClick={() => setViewAngleDeg((prev) => (prev - 45 + 360) % 360)}
              title="Rotate View Left (-45°)"
              style={{
                background: '#fff',
                border: '1px solid #ccc',
                borderRadius: 4,
                padding: '3px 8px',
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              ↺ -45°
            </button>
            <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, minWidth: 32, textAlign: 'center' }}>
              {viewAngleDeg}°
            </span>
            <button
              onClick={() => setViewAngleDeg((prev) => (prev + 45) % 360)}
              title="Rotate View Right (+45°)"
              style={{
                background: '#fff',
                border: '1px solid #ccc',
                borderRadius: 4,
                padding: '3px 8px',
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              ↻ +45°
            </button>

            <div style={{ width: 1, height: 16, background: '#ccc', margin: '0 4px' }} />

            {/* Spin All Models Turntable Toggle */}
            <button
              onClick={() => setIsSpinAll((v) => !v)}
              style={{
                background: isSpinAll ? '#f59e0b' : '#fff',
                color: isSpinAll ? '#fff' : '#333',
                border: '1px solid #ccc',
                borderRadius: 14,
                padding: '4px 10px',
                fontSize: 11,
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.15s',
              }}
            >
              <span>{isSpinAll ? '⏸ Pause Spin' : '🔄 Spin All (Turntable)'}</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <a
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#2f3537',
                color: '#fff',
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              ← Return to Office (/)
            </a>
          </div>
        </div>

        {/* Row 2: Reference Boards Selector, Category Filters, Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Reference Board Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label htmlFor="ref-board-select" style={{ fontSize: 11, fontWeight: 700, color: '#555' }}>
              SOURCE BOARD:
            </label>
            <select
              id="ref-board-select"
              value={selectedDropdownValue}
              onChange={(e) => {
                setBoardFilter(e.target.value)
                setCurrentPage(1)
              }}
              style={{
                padding: '4px 8px',
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 6,
                border: '1px solid #bbb',
                background: '#fff',
                color: '#222',
                cursor: 'pointer',
              }}
            >
              <option value="all_ref">All Reference Sheets (877 Cutouts)</option>
              <option value="pipeline_v2">✨ Pipeline V2 Audited ({PIPELINE_V2_ASSET_IDS.length})</option>
              <option value="canonical">Canonical Office Kit (34)</option>
              <option value="all">All Assets Combined (911)</option>
              <optgroup label="11 Individual Reference Boards">
                {REFERENCE_BOARDS.map((b) => (
                  <option key={b.id} value={b.name}>
                    {b.name} ({b.count})
                  </option>
                ))}
              </optgroup>
            </select>

            {/* Pipeline V2 Audited Quick Filter */}
            <button
              onClick={() => {
                setBoardFilter(boardFilter === 'pipeline_v2' ? 'all_ref' : 'pipeline_v2')
                setCurrentPage(1)
              }}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 6,
                border: boardFilter === 'pipeline_v2' ? '1px solid #2563eb' : '1px solid #bbb',
                background: boardFilter === 'pipeline_v2' ? '#2563eb' : '#fff',
                color: boardFilter === 'pipeline_v2' ? '#fff' : '#1e40af',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span>✨ Pipeline V2 Audited ({PIPELINE_V2_ASSET_IDS.length})</span>
            </button>

            {/* Link to Full HTML Review Dashboard */}
            <a
              href="/assets/review_dashboard.html"
              target="_blank"
              rel="noreferrer"
              style={{
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 6,
                border: '1px solid #10b981',
                background: '#ecfdf5',
                color: '#065f46',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>📊 AI Review Dashboard ↗</span>
            </a>
          </div>

          {/* Category Filter Pills */}
          <div style={{ display: 'flex', gap: 4, background: '#eceae4', padding: '2px 4px', borderRadius: 16, overflowX: 'auto', maxWidth: '42vw' }}>
            {[
              { id: 'all', label: 'All' },
              { id: 'workstation', label: 'Workstations' },
              { id: 'seating', label: 'Seating' },
              { id: 'meeting', label: 'Meeting' },
              { id: 'architecture', label: 'Architecture' },
              { id: 'greenery', label: 'Greenery' },
              { id: 'tech', label: 'Tech' },
              { id: 'storage', label: 'Storage' },
              { id: 'lounge', label: 'Lounge' },
              { id: 'kitchen', label: 'Kitchen' },
              { id: 'partition', label: 'Partitions' },
              { id: 'utility', label: 'Utility' },
            ].map((cat) => {
              const active = categoryFilter === cat.id
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setCategoryFilter(cat.id)
                    setCurrentPage(1)
                  }}
                  style={{
                    padding: '3px 9px',
                    borderRadius: 12,
                    border: 'none',
                    background: active ? '#2f3537' : 'transparent',
                    color: active ? '#fff' : '#555',
                    fontWeight: 600,
                    fontSize: 11,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cat.label}
                </button>
              )
            })}
          </div>

          {/* Search Box */}
          <input
            type="text"
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              borderRadius: 6,
              border: '1px solid #bbb',
              background: '#fff',
              width: 140,
            }}
          />

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
              <span style={{ fontSize: 11, color: '#555', fontWeight: 600 }}>
                Page {currentPage} of {totalPages} ({filteredAssets.length} assets)
              </span>
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: '3px 8px',
                  fontSize: 11,
                  borderRadius: 4,
                  border: '1px solid #bbb',
                  background: currentPage <= 1 ? '#eee' : '#fff',
                  cursor: currentPage <= 1 ? 'default' : 'pointer',
                }}
              >
                ◀ Prev
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  padding: '3px 8px',
                  fontSize: 11,
                  borderRadius: 4,
                  border: '1px solid #bbb',
                  background: currentPage >= totalPages ? '#eee' : '#fff',
                  cursor: currentPage >= totalPages ? 'default' : 'pointer',
                }}
              >
                Next ▶
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Asset Details Inspector Card & 360° Turntable */}
      {selectedAsset && (
        <aside
          className="glass-panel"
          style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            width: 370,
            background: 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(16px)',
            borderRadius: 10,
            padding: 16,
            boxShadow: '0 8px 30px rgba(0,0,0,0.14)',
            zIndex: 10,
            maxHeight: 'calc(100vh - 160px)',
            overflowY: 'auto',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#888', letterSpacing: 0.5 }}>
              Selected Asset · {selectedAsset.category}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', background: '#fffbeb', padding: '2px 6px', borderRadius: 4 }}>
              ROTATION: {normalizedDeg}°
            </span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111', margin: '4px 0 10px' }}>
            {selectedAsset.name}
          </div>

          {/* Tab Selector: 3D Turntable vs Reviewer Agent Audit */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, background: '#eee', padding: 3, borderRadius: 8 }}>
            <button
              onClick={() => setInspectorTab('3d')}
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 6,
                border: 'none',
                background: inspectorTab === '3d' ? '#2f3537' : 'transparent',
                color: inspectorTab === '3d' ? '#fff' : '#666',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              🎮 3D Turntable
            </button>
            <button
              onClick={() => setInspectorTab('audit')}
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 6,
                border: 'none',
                background: inspectorTab === 'audit' ? '#2563eb' : 'transparent',
                color: inspectorTab === 'audit' ? '#fff' : reviewData ? '#1e40af' : '#666',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                transition: 'all 0.15s',
              }}
            >
              <span>🔍 AI Reviewer Diff</span>
              {reviewData && (
                <span style={{
                  background: reviewData.overall_score >= 80 ? '#10b981' : '#f59e0b',
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 800,
                  padding: '1px 5px',
                  borderRadius: 10
                }}>
                  {reviewData.overall_score}%
                </span>
              )}
            </button>
          </div>

          {inspectorTab === '3d' && (
            <>
              {/* 360° Interactive Turntable Viewport */}
              <div style={{ marginBottom: 12 }}>
                <InspectorTurntable
                  asset={selectedAsset}
                  isAutoRotate={isInspectorAutoSpin}
                  onToggleAutoRotate={() => setIsInspectorAutoSpin((v) => !v)}
                />
              </div>

              {/* Model Rotation Control Buttons & Slider */}
              <div style={{ background: '#f5f4ef', padding: '10px', borderRadius: 6, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#444' }}>
                    ROTATE IN VIEW:
                  </span>
                  <button
                    onClick={() => setIsAutoRotateSelected((v) => !v)}
                    style={{
                      background: isAutoRotateSelected ? '#f59e0b' : '#e0ddd5',
                      color: isAutoRotateSelected ? '#fff' : '#444',
                      border: 'none',
                      borderRadius: 4,
                      padding: '2px 8px',
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {isAutoRotateSelected ? '⏸ Auto-Spin ON' : '▶ Auto-Spin [Space]'}
                  </button>
                </div>

                {/* Quick Angle Buttons */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <button
                    onClick={() => rotateSelectedBy(-Math.PI / 4)}
                    title="Rotate Left 45° [Q]"
                    style={{ flex: 1, padding: '5px', fontSize: 11, fontWeight: 600, borderRadius: 4, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
                  >
                    ↺ -45° [Q]
                  </button>
                  <button
                    onClick={() => rotateSelectedBy(Math.PI / 4)}
                    title="Rotate Right 45° [E]"
                    style={{ flex: 1, padding: '5px', fontSize: 11, fontWeight: 600, borderRadius: 4, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
                  >
                    ↻ +45° [E]
                  </button>
                  <button
                    onClick={() => rotateSelectedBy(Math.PI / 2)}
                    title="Rotate 90°"
                    style={{ flex: 1, padding: '5px', fontSize: 11, fontWeight: 600, borderRadius: 4, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
                  >
                    ⟳ 90°
                  </button>
                  <button
                    onClick={() => setExactRotationDeg(0)}
                    title="Reset Rotation [R]"
                    style={{ flex: 1, padding: '5px', fontSize: 11, fontWeight: 600, borderRadius: 4, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
                  >
                    Reset [R]
                  </button>
                </div>

                {/* Angle Slider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="5"
                    value={normalizedDeg}
                    onChange={(e) => setExactRotationDeg(Number(e.target.value))}
                    style={{ flex: 1, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, width: 36, textAlign: 'right' }}>
                    {normalizedDeg}°
                  </span>
                </div>
                <div style={{ fontSize: 10, color: '#777', marginTop: 4, textAlign: 'center' }}>
                  💡 Tip: Click & drag horizontally on the model in the 3D scene to spin it.
                </div>
              </div>

              {/* Source Cutout PNG Comparison (if available) */}
              {selectedAsset.thumbnail && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f5f4ef', padding: '8px 10px', borderRadius: 6, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 54,
                      height: 54,
                      background: '#fff',
                      border: '1px solid #ddd',
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    <img
                      src={selectedAsset.thumbnail}
                      alt={selectedAsset.name}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: '#555', flex: 1 }}>
                    <div style={{ fontWeight: 700, color: '#222' }}>Source Reference PNG Cutout</div>
                    <div style={{ fontSize: 10, color: '#777', marginTop: 2 }}>
                      From: {selectedAsset.sourceBoard}
                    </div>
                    {reviewData && (
                      <button
                        onClick={() => setInspectorTab('audit')}
                        style={{
                          marginTop: 6,
                          padding: '3px 8px',
                          fontSize: 10,
                          fontWeight: 700,
                          background: '#2563eb',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                        }}
                      >
                        Compare 2D vs 3D ({reviewData.overall_score}% Score) →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Dimensions & Metadata Table */}
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', color: '#333' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '3px 0', color: '#666' }}>Asset ID:</td>
                    <td style={{ padding: '3px 0', fontFamily: 'monospace', fontWeight: 600 }}>{selectedAsset.id}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '3px 0', color: '#666' }}>Dimensions:</td>
                    <td style={{ padding: '3px 0' }}>
                      {selectedAsset.dimensionsM.w}m × {selectedAsset.dimensionsM.d}m × {selectedAsset.dimensionsM.h}m
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '3px 0', color: '#666' }}>Footprint:</td>
                    <td style={{ padding: '3px 0' }}>{selectedAsset.footprint.w}m × {selectedAsset.footprint.d}m</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '3px 0', color: '#666' }}>Tri Count:</td>
                    <td style={{ padding: '3px 0', fontWeight: 600 }}>{selectedAsset.triCount || 24} tris</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '3px 0', color: '#666' }}>Collision:</td>
                    <td style={{ padding: '3px 0' }}>
                      <span style={{ textTransform: 'uppercase', fontWeight: 600, color: selectedAsset.collision === 'solid' ? '#c62828' : '#2e7d32' }}>
                        {selectedAsset.collision}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '3px 0', color: '#666' }}>Palette:</td>
                    <td style={{ padding: '3px 0' }}>{selectedAsset.palette?.join(', ') || 'charcoal, oak'}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {inspectorTab === 'audit' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {isLoadingReview ? (
                <div style={{ padding: '30px 10px', textAlign: 'center', color: '#666', fontSize: 12 }}>
                  ⏳ Loading AI Reviewer Audit & Trajectory...
                </div>
              ) : reviewData ? (
                <div id="review-data-loaded" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Refiner Agent Loop Trajectory Tracker (if present) */}
                  {refinementLoop && (
                    <div style={{
                      background: '#f0fdf4',
                      border: '1px solid #86efac',
                      borderRadius: 8,
                      padding: '10px 12px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span>🔄</span>
                          <span>REFINER AGENT LOOP ({refinementLoop.total_iterations} PASSES)</span>
                        </span>
                        <span style={{
                          fontSize: 9,
                          fontWeight: 800,
                          padding: '2px 7px',
                          borderRadius: 10,
                          background: refinementLoop.converged ? '#16a34a' : '#ca8a04',
                          color: '#fff'
                        }}>
                          {refinementLoop.converged ? '✓ CONVERGED' : 'OPTIMIZED'}
                        </span>
                      </div>
                      
                      <div style={{ fontSize: 11, color: '#15803d', marginBottom: 8, lineHeight: 1.3 }}>
                        Initial: <strong>{refinementLoop.initial_score}%</strong> ➔ Winner: <strong>{refinementLoop.final_score}%</strong>{' '}
                        <span style={{ fontWeight: 700, color: '#166534' }}>
                          ({refinementLoop.score_delta > 0 ? '+' + refinementLoop.score_delta + '% gain' : 'optimal'})
                        </span>
                      </div>

                      {/* Step Scrubber / Buttons */}
                      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                        {refinementLoop.iterations.map((step: RefineStep, idx: number) => {
                          const isSelected = selectedIteration === idx || (selectedIteration === null && idx === refinementLoop.iterations.length - 1)
                          const isWinner = idx === refinementLoop.iterations.length - 1
                          return (
                            <button
                              key={idx}
                              onClick={() => setSelectedIteration(idx)}
                              style={{
                                flex: '1 0 auto',
                                padding: '5px 8px',
                                borderRadius: 6,
                                border: isSelected ? '2px solid #16a34a' : '1px solid #cbd5e1',
                                background: isSelected ? '#dcfce7' : '#fff',
                                color: '#1e293b',
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontSize: 10,
                              }}
                            >
                              <div style={{ fontWeight: 700, color: isSelected ? '#15803d' : '#475569' }}>
                                Iter {step.iteration} {isWinner ? '🏆' : ''}
                              </div>
                              <div style={{ fontSize: 11, fontWeight: 800, color: step.score >= 80 ? '#16a34a' : '#d97706' }}>
                                {step.score}%
                              </div>
                            </button>
                          )
                        })}
                      </div>

                      {/* Active Step Parametric Adjustments Note */}
                      {activeStep && (
                        <div style={{ marginTop: 8, background: '#fff', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 10 }}>
                          <div style={{ fontWeight: 700, color: '#334155', marginBottom: 2 }}>
                            Iteration {activeStep.iteration} Parametric Adjustments:
                          </div>
                          {activeStep.applied_adjustments && activeStep.applied_adjustments.length > 0 ? (
                            <ul style={{ margin: 0, paddingLeft: 14, color: '#475569', lineHeight: 1.4 }}>
                              {activeStep.applied_adjustments.map((adj: string, aIdx: number) => (
                                <li key={aIdx}>{adj}</li>
                              ))}
                            </ul>
                          ) : (
                            <div style={{ color: '#64748b', fontStyle: 'italic' }}>Initial baseline synthesized from computer vision blueprint.</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* AI Asset Characterization: What It Is vs How It Is */}
                  {(() => {
                    const ident = reviewData.identification_breakdown
                    const whatItIs = ident?.what_it_is
                    const howItIs = ident?.how_it_is
                    return (
                      <div style={{
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: 8,
                        padding: '12px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                      }}>
                        {/* Header: What It Is & Score */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          paddingBottom: 8,
                          marginBottom: 8,
                          borderBottom: '1px solid #f1f5f9'
                        }}>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>
                              AI Identified Asset:
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginTop: 1 }}>
                              {whatItIs?.display_name || reviewData.asset_class.replace(/_/g, ' ').toUpperCase()}
                            </div>
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>
                              Class: <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 4, fontWeight: 700, color: '#2563eb' }}>{reviewData.asset_class}</code>
                              <span style={{ margin: '0 6px' }}>•</span>
                              Category: <span style={{ textTransform: 'capitalize', fontWeight: 600, color: '#334155' }}>{reviewData.category}</span>
                            </div>
                            {whatItIs?.primary_function && (
                              <div style={{ fontSize: 10, color: '#475569', marginTop: 3, fontStyle: 'italic' }}>
                                "{whatItIs.primary_function}"
                              </div>
                            )}
                          </div>
                          <div style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            background: (displayScore ?? 0) >= 80 ? '#10b981' : '#f59e0b',
                            color: '#fff',
                            fontSize: 12,
                            fontWeight: 800,
                            whiteSpace: 'nowrap'
                          }}>
                            {displayScore}% · {displayVerdict}
                          </div>
                        </div>

                        {/* How It Is: Physical Structure, Morphology & Cues */}
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
                          How The Asset Is Structured & Composed:
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10 }}>
                          {/* Structure */}
                          <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: 4, borderLeft: '3px solid #3b82f6' }}>
                            <span style={{ fontWeight: 700, color: '#1e3a8a' }}>🏗️ Physical Structure: </span>
                            <span style={{ color: '#334155', lineHeight: 1.45 }}>
                              {howItIs?.structural_composition || 'Modular physical assembly matching blueprint specifications.'}
                            </span>
                          </div>

                          {/* Materials & Finishes */}
                          <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: 4, borderLeft: '3px solid #10b981' }}>
                            <span style={{ fontWeight: 700, color: '#065f46' }}>🎨 Materials & Finishes: </span>
                            <span style={{ color: '#334155', lineHeight: 1.45 }}>
                              {howItIs?.materials_and_finishes || 'PBR metallic/roughness procedural material calibration.'}
                            </span>
                          </div>

                          {/* Form & Proportions */}
                          <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: 4, borderLeft: '3px solid #f59e0b' }}>
                            <span style={{ fontWeight: 700, color: '#92400e' }}>📐 Form & Proportions: </span>
                            <span style={{ color: '#334155', lineHeight: 1.45 }}>
                              {howItIs?.form_and_silhouette || 'Bounded metric 3D footprint.'}
                            </span>
                          </div>

                          {/* Orientation & Viewpoint */}
                          <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: 4, borderLeft: '3px solid #8b5cf6' }}>
                            <span style={{ fontWeight: 700, color: '#5b21b6' }}>🧭 Pose & Viewpoint: </span>
                            <span style={{ color: '#334155', lineHeight: 1.45 }}>
                              {howItIs?.spatial_orientation_and_pose || 'Aligned to standard 45° isometric room viewpoint.'}
                            </span>
                          </div>

                          {/* Visual Cues Detected */}
                          {howItIs?.detected_visual_cues && howItIs.detected_visual_cues.length > 0 && (
                            <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: 4, borderLeft: '3px solid #64748b' }}>
                              <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 3 }}>
                                👁️ Computer Vision Evidence Cues Detected:
                              </div>
                              <ul style={{ margin: 0, paddingLeft: 14, color: '#475569', lineHeight: 1.4 }}>
                                {howItIs.detected_visual_cues.map((cue: string, cIdx: number) => (
                                  <li key={cIdx}>{cue}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}

                  {/* 3-Panel Visual Diff Composite */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#444', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Visual Diff & Silhouette Alignment:</span>
                      <span style={{ fontSize: 10, color: '#888' }}>
                        {activeStep ? 'Iter ' + activeStep.iteration + ' (' + activeStep.score + '%)' : '[Ref] | [3D] | [Diff]'}
                      </span>
                    </div>
                    <div style={{
                      background: '#14161a',
                      borderRadius: 6,
                      overflow: 'hidden',
                      border: '1px solid #ddd',
                      padding: 2
                    }}>
                      <img
                        src={comparisonImageUrl}
                        alt="Visual comparison"
                        style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 4 }}
                      />
                    </div>
                  </div>

                  {/* Trigger Looping Refiner Agent Action Button */}
                  <div>
                    <button
                      onClick={handleRunRefinerLoop}
                      disabled={isRefining}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: 'none',
                        background: isRefining ? '#94a3b8' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: isRefining ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        boxShadow: '0 2px 4px rgba(37, 99, 235, 0.25)',
                      }}
                    >
                      {isRefining ? '⚙️ Refiner Agent Mutating & Auditing in Blender...' : (refinementLoop ? '🔄 Re-run Refiner Convergence Loop' : '⚡ Run Looping Refiner on this Asset')}
                    </button>
                    {refineFeedback && (
                      <div style={{
                        marginTop: 6,
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '6px 8px',
                        borderRadius: 4,
                        background: refineFeedback.includes('complete') ? '#ecfdf5' : '#f1f5f9',
                        color: refineFeedback.includes('complete') ? '#065f46' : '#334155',
                        textAlign: 'center',
                      }}>
                        {refineFeedback}
                      </div>
                    )}
                  </div>

                  {/* Metrics Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    <div style={{ background: '#f5f4ef', padding: '8px', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#111' }}>
                        {displayIoU}%
                      </div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#777', textTransform: 'uppercase' }}>
                        Silhouette IoU
                      </div>
                    </div>
                    <div style={{ background: '#f5f4ef', padding: '8px', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#111' }}>
                        {displayColor}%
                      </div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#777', textTransform: 'uppercase' }}>
                        Color Fidelity
                      </div>
                    </div>
                    <div style={{ background: '#f5f4ef', padding: '8px', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#111' }}>
                        {reviewData.metrics.component_completeness_percent}%
                      </div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#777', textTransform: 'uppercase' }}>
                        Components
                      </div>
                    </div>
                  </div>

                  {/* Subcomponents Checklist */}
                  {reviewData.component_audit && (
                    <div style={{ background: '#f8f8f6', padding: '10px', borderRadius: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#333', marginBottom: 6 }}>
                        Physical Subcomponents Identified & Built:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {reviewData.component_audit.map((c, idx: number) => (
                          <span
                            key={idx}
                            style={{
                              background: '#e0f2fe',
                              color: '#0369a1',
                              fontSize: 10,
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: 4,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3
                            }}
                          >
                            ✓ {c.component}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reviewer Critique */}
                  {reviewData.critique && (
                    <div style={{ background: '#f5f4ef', padding: '10px', borderRadius: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#333', marginBottom: 4 }}>
                        Reviewer Agent Audit Critique:
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: '#555', lineHeight: 1.4 }}>
                        {reviewData.critique.map((note: string, idx: number) => (
                          <li key={idx}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Link to Full HTML Dashboard */}
                  <a
                    href="/assets/review_dashboard.html"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'block',
                      textAlign: 'center',
                      background: '#1e293b',
                      color: '#fff',
                      padding: '8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    Open Standalone Review Dashboard ↗
                  </a>
                </div>
              ) : (
                <div style={{ padding: '20px 10px', textAlign: 'center', color: '#666' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#222', marginBottom: 6 }}>
                    No Reviewer Audit on File
                  </div>
                  <div style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 12 }}>
                    This asset was imported from the legacy batch. Click the button below to filter to the Pipeline V2 audited assets with complete side-by-side diffs.
                  </div>
                  <button
                    onClick={() => {
                      setBoardFilter('pipeline_v2')
                      setInspectorTab('audit')
                    }}
                    style={{
                      background: '#2563eb',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '6px 14px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    View Pipeline V2 Audited Assets ({PIPELINE_V2_ASSET_IDS.length})
                  </button>
                </div>
              )}
            </div>
          )}
        </aside>
      )}

      {/* Asset Quick Switcher Rail (Right Side) */}
      <nav
        style={{
          position: 'absolute',
          bottom: 20,
          right: 20,
          maxHeight: '55vh',
          width: 250,
          overflowY: 'auto',
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(16px)',
          borderRadius: 8,
          padding: 8,
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          zIndex: 10,
        }}
      >
        <div style={{ padding: '4px 8px', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
          <span>Assets on Page</span>
          <span>{paginatedAssets.length}</span>
        </div>
        {paginatedAssets.map((a) => (
          <button
            key={a.id}
            onClick={() => setSelectedId(a.id)}
            style={{
              padding: '6px 10px',
              border: 'none',
              borderRadius: 4,
              background: a.id === selectedId ? '#2f3537' : 'transparent',
              color: a.id === selectedId ? '#fff' : '#333',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
            <span style={{ opacity: 0.6, fontSize: 10, flexShrink: 0 }}>{a.triCount || 24}t</span>
          </button>
        ))}
      </nav>
    </main>
  )
}
