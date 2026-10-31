import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export const OFFICE_CENTER_TARGET: [number, number, number] = [6.0, 1.1, 5.0]
export const CAMERA_OFFSET: [number, number, number] = [16.0, 16.0, 16.0]

export function calculateFitZoom(
  width: number,
  height: number,
  leftRailOpen: boolean,
  rightCardOpen: boolean
): number {
  const leftSpace = leftRailOpen ? 310 : 50
  const rightSpace = rightCardOpen ? 330 : 50
  const availableW = Math.max(width - leftSpace - rightSpace, 400)
  const availableH = Math.max(height - 180, 360)

  // Office visual bounding box in isometric projection:
  // horizontal span ~15.8m, vertical span ~11.2m
  const fitW = availableW / 15.8
  const fitH = availableH / 11.2
  const fit = Math.min(fitW, fitH)
  return Math.min(Math.max(Math.round(fit), 26), 56)
}

export type ZoomTrigger = {
  type: 'in' | 'out' | 'fit'
  id: number
}

type CameraControllerProps = {
  isLeftRailOpen: boolean
  isRightCardOpen: boolean
  recenterTrigger: number
  zoomTrigger: ZoomTrigger | null
  onZoomChange?: (zoom: number, fitZoom: number) => void
}

export default function CameraController({
  isLeftRailOpen,
  isRightCardOpen,
  recenterTrigger,
  zoomTrigger,
  onZoomChange,
}: CameraControllerProps) {
  const { camera, gl } = useThree()
  const target = useRef(new THREE.Vector3(...OFFICE_CENTER_TARGET))
  const lastZoomTriggerId = useRef<number | null>(null)
  const lastRecenterId = useRef<number>(recenterTrigger)
  const baseFitZoom = useRef<number>(44)
  const hasInitialized = useRef(false)
  const onZoomChangeRef = useRef(onZoomChange)

  // Keep callback ref updated without re-triggering effects
  useEffect(() => {
    onZoomChangeRef.current = onZoomChange
  })

  // Calculate and apply initial framing or updates on sidebar toggle
  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera
    const fit = calculateFitZoom(window.innerWidth, window.innerHeight, isLeftRailOpen, isRightCardOpen)
    const prevFit = baseFitZoom.current
    baseFitZoom.current = fit

    if (!hasInitialized.current) {
      hasInitialized.current = true
      target.current.set(...OFFICE_CENTER_TARGET)
      camera.position.set(
        target.current.x + CAMERA_OFFSET[0],
        target.current.y + CAMERA_OFFSET[1],
        target.current.z + CAMERA_OFFSET[2]
      )
      camera.lookAt(target.current)
      ortho.zoom = fit
      ortho.updateProjectionMatrix()
      onZoomChangeRef.current?.(ortho.zoom, fit)
    } else if (Math.abs(ortho.zoom - prevFit) < 1) {
      // Only auto-reframe if the user was already at fit zoom
      ortho.zoom = fit
      ortho.updateProjectionMatrix()
      onZoomChangeRef.current?.(ortho.zoom, fit)
    }

    const onResize = () => {
      const nextFit = calculateFitZoom(window.innerWidth, window.innerHeight, isLeftRailOpen, isRightCardOpen)
      baseFitZoom.current = nextFit
      ortho.updateProjectionMatrix()
      onZoomChangeRef.current?.(ortho.zoom, nextFit)
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [camera, isLeftRailOpen, isRightCardOpen])

  // Recenter trigger
  useEffect(() => {
    if (recenterTrigger === lastRecenterId.current) return
    lastRecenterId.current = recenterTrigger

    const ortho = camera as THREE.OrthographicCamera
    target.current.set(...OFFICE_CENTER_TARGET)
    camera.position.set(
      target.current.x + CAMERA_OFFSET[0],
      target.current.y + CAMERA_OFFSET[1],
      target.current.z + CAMERA_OFFSET[2]
    )
    camera.lookAt(target.current)

    const fit = calculateFitZoom(window.innerWidth, window.innerHeight, isLeftRailOpen, isRightCardOpen)
    baseFitZoom.current = fit
    ortho.zoom = fit
    ortho.updateProjectionMatrix()
    onZoomChangeRef.current?.(ortho.zoom, fit)
  }, [recenterTrigger, camera, isLeftRailOpen, isRightCardOpen])

  // Zoom trigger (+ / - buttons)
  useEffect(() => {
    if (!zoomTrigger || zoomTrigger.id === lastZoomTriggerId.current) return
    lastZoomTriggerId.current = zoomTrigger.id

    const ortho = camera as THREE.OrthographicCamera
    let nextZoom = ortho.zoom
    if (zoomTrigger.type === 'in') {
      nextZoom = Math.min(ortho.zoom * 1.18, 120)
    } else if (zoomTrigger.type === 'out') {
      nextZoom = Math.max(ortho.zoom * 0.85, 20)
    } else if (zoomTrigger.type === 'fit') {
      nextZoom = baseFitZoom.current
    }

    ortho.zoom = Math.round(nextZoom)
    ortho.updateProjectionMatrix()
    onZoomChangeRef.current?.(ortho.zoom, baseFitZoom.current)
  }, [zoomTrigger, camera])

  // Pointer drag panning and scroll wheel zoom
  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera
    const canvas = gl.domElement
    let lastPoint: { x: number; y: number } | null = null

    const onDown = (event: PointerEvent) => {
      // Right click (2) or middle click (1)
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
    }

    const onUp = (event: PointerEvent) => {
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId)
      }
      lastPoint = null
    }

    const onWheel = (event: WheelEvent) => {
      // Don't intercept if scrolling inside a panel or card
      const targetElem = event.target as HTMLElement | null
      if (targetElem && (targetElem.closest('.glass-panel') || targetElem.closest('.left-rail') || targetElem.closest('.record-drawer') || targetElem.closest('.ask-modal'))) {
        return
      }

      event.preventDefault()
      // Smooth exponential zoom
      const zoomFactor = event.deltaY < 0 ? 1.10 : 0.90
      const nextZoom = THREE.MathUtils.clamp(ortho.zoom * zoomFactor, 20, 130)
      ortho.zoom = Math.round(nextZoom)
      ortho.updateProjectionMatrix()
      onZoomChangeRef.current?.(ortho.zoom, baseFitZoom.current)
    }

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault()
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('wheel', onWheel)
    }
  }, [camera, gl])

  return null
}
