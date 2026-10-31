import * as THREE from 'three'

/** Colour tokens from DESIGN_SPEC.md section 4. */
export const PALETTE = {
  floor: '#B9BBBE',
  floorLight: '#D2D3D4',
  wallWhite: '#F4F4F2',
  frameDark: '#1E2126',
  glass: '#BFD9E6',
  background: '#DFE5EA',
} as const

/** The fixed camera: true isometric from the south-west (azimuth 45, elevation 35.264 degrees). */
export const VIEW_DIR = new THREE.Vector3(-1, 1, 1).normalize()
export const ELEVATION = Math.asin(VIEW_DIR.y)
/** Upright cut-outs turn to face the camera's azimuth (their normal points south-west). */
export const SPRITE_YAW = Math.atan2(VIEW_DIR.x, VIEW_DIR.z)
