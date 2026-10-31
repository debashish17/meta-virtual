import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

interface TaskItem {
  name: string
  model: string
  rotDeg?: number
}

export default function BatchSnapshotRenderer() {
  const [status, setStatus] = useState<string>('Initializing...')
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 })
  const [isComplete, setIsComplete] = useState<boolean>(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let isCancelled = false

    async function runBatch() {
      try {
        setStatus('Fetching task list...')
        const res = await fetch('/assets/batch_snapshot_tasks.json')
        if (!res.ok) {
          throw new Error('Could not load /assets/batch_snapshot_tasks.json')
        }
        const tasks: TaskItem[] = await res.json()
        setProgress({ current: 0, total: tasks.length })
        setStatus(`Loaded ${tasks.length} tasks. Initializing Three.js...`)

        const canvas = canvasRef.current
        if (!canvas) return

        const width = 512
        const height = 512

        // Setup Three.js scene, camera, lights
        const scene = new THREE.Scene()
        const aspect = width / height
        const frustum = 3.8
        const camera = new THREE.OrthographicCamera(
          (-frustum * aspect) / 2,
          (frustum * aspect) / 2,
          frustum / 2,
          -frustum / 2,
          0.1,
          80
        )
        const rad = Math.PI / 4
        camera.position.set(12 * Math.cos(rad), 9.8, 12 * Math.sin(rad))
        camera.lookAt(0, 0.45, 0)

        const renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
        })
        renderer.setSize(width, height)
        renderer.setClearColor(0x1c1e22, 1.0)
        renderer.shadowMap.enabled = true

        // Lighting matching web client
        const amb = new THREE.AmbientLight(0xffffff, 0.75)
        scene.add(amb)
        const hemi = new THREE.HemisphereLight(0xfff9ec, 0x81867f, 1.6)
        scene.add(hemi)
        const dir1 = new THREE.DirectionalLight(0xffffff, 2.5)
        dir1.position.set(-10, 18, 10)
        dir1.castShadow = true
        scene.add(dir1)
        const dir2 = new THREE.DirectionalLight(0xe0e8ff, 0.8)
        dir2.position.set(10, 12, -10)
        scene.add(dir2)

        const loader = new GLTFLoader()

        // Process each task
        for (let i = 0; i < tasks.length; i++) {
          if (isCancelled) break
          const task = tasks[i]
          setStatus(`Rendering ${i + 1}/${tasks.length}: ${task.name}...`)
          setProgress({ current: i + 1, total: tasks.length })

          try {
            const gltf = await loader.loadAsync(task.model)
            const root = gltf.scene

            root.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true
                child.receiveShadow = true
              }
            })

            // Normalization
            const box = new THREE.Box3().setFromObject(root)
            const size = new THREE.Vector3()
            box.getSize(size)
            const maxDim = Math.max(size.x, size.y, size.z, 0.001)
            const scale = 1.35 / maxDim
            root.scale.set(scale, scale, scale)

            box.setFromObject(root)
            const center = new THREE.Vector3()
            box.getCenter(center)
            root.position.x -= center.x
            root.position.z -= center.z
            root.position.y -= box.min.y

            if (task.rotDeg) {
              root.rotation.y = (task.rotDeg * Math.PI) / 180
            }

            scene.add(root)
            renderer.render(scene, camera)

            const dataUrl = canvas.toDataURL('image/png')

            // Send to server receiver
            await fetch('http://localhost:2567/api/save_snapshot', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: task.name,
                image: dataUrl,
              }),
            })

            // Clean up
            scene.remove(root)
            root.traverse((obj) => {
              if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose()
            })
          } catch (err) {
            console.error(`Error rendering ${task.name}:`, err)
          }
        }

        setStatus('Batch snapshot rendering complete!')
        setIsComplete(true)
      } catch (err) {
        setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
        console.error('Batch snapshot error:', err)
      }
    }

    runBatch()

    return () => {
      isCancelled = true
    }
  }, [])

  return (
    <div
      style={{
        padding: 24,
        background: '#111',
        color: '#fff',
        fontFamily: 'monospace',
        minHeight: '100vh',
      }}
    >
      <h2>Batch Snapshot Renderer (Headless)</h2>
      <div style={{ marginBottom: 12 }}>{status}</div>
      <div style={{ marginBottom: 20 }}>
        Progress: {progress.current} / {progress.total}
      </div>
      <canvas
        ref={canvasRef}
        width={512}
        height={512}
        style={{ border: '1px solid #444', display: 'block' }}
      />
      {isComplete && <div id="batch-done">DONE</div>}
    </div>
  )
}
