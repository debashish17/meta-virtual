import { Canvas } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Suspense, useMemo } from 'react'
import * as THREE from 'three'

function SnapshotModel({ modelPath }: { modelPath: string }) {
  const gltf = useGLTF(modelPath)
  const scene = useMemo(() => {
    const s = gltf.scene.clone(true)
    s.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
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

export default function SnapshotRenderer() {
  const params = new URLSearchParams(window.location.search)
  const modelPath = params.get('model') || '/assets/models/seating.office-chair.glb'
  const rotDeg = Number(params.get('rot')) || 0

  return (
    <div
      id="snapshot-container"
      style={{
        width: 512,
        height: 512,
        background: '#1c1e22',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Canvas
        orthographic
        camera={{
          position: [12 * Math.cos(Math.PI / 4), 9.8, 12 * Math.sin(Math.PI / 4)],
          zoom: 165,
          near: 0.1,
          far: 60,
        }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      >
        <ambientLight intensity={0.75} />
        <hemisphereLight args={['#fff9ec', '#81867f', 1.6]} />
        <directionalLight position={[-10, 18, 10]} intensity={2.5} castShadow />
        <directionalLight position={[10, 12, -10]} intensity={0.8} color="#e0e8ff" />
        <group rotation={[0, (rotDeg * Math.PI) / 180, 0]}>
          <Suspense fallback={null}>
            <SnapshotModel modelPath={modelPath} />
          </Suspense>
        </group>
      </Canvas>
      <div id="snapshot-ready" style={{ display: 'none' }} />
    </div>
  )
}
