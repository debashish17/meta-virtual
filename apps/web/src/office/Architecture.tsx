import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { WORLD, wallPieces, type Finish, type Obstacle, type Wall } from '@office/shared'
import { PALETTE, VIEW_DIR } from './palette'
import { avatar, OVERVIEW } from './state'

/**
 * Floor, walls, glass partitions and the window wall. Solid walls fade while they hide the avatar
 * (DESIGN_SPEC 8). An invisible ceiling and the space above the low south and west walls cast
 * shadows but are never drawn, so daylight reaches the floor only through the east windows.
 */

const FRAME = 0.045          // black glass frame bar
const GLASS_PANEL = 1.2      // a frame post every 1.2 m along a glass run
const FADED = 0.22

const frameMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.frameDark, roughness: 0.5, metalness: 0.3 })
const glassMaterial = new THREE.MeshStandardMaterial({
  color: PALETTE.glass, transparent: true, opacity: 0.22, roughness: 0.08, metalness: 0.1, depthWrite: false,
})
const shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z)

const PX = 40   // floor texture pixels per metre

/** Base colour of each floor finish; concrete is the DESIGN_SPEC floor token. */
const FINISH: Record<Finish, string> = {
  oak: '#cbb293', terrazzo: '#dcd8d1', light: PALETTE.floorLight,
  carpet_slate: '#9da6af', carpet_sage: '#a5ad9e', carpet_sand: '#bbb0a0', carpet_stone: '#aaa9a7',
  carpet_charcoal: '#8b8e93', mat: '#3d4044',
}

const rgb = (hex: string, k = 1) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${[n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.min(255, Math.round(c * k))).join(',')})`
}

type Paint = { g: CanvasRenderingContext2D; rand: () => number; x: number; z: number; w: number; d: number }

/** Joints every `step` metres inside a patch. */
function joints({ g, x, z, w, d }: Paint, step: number, colour: string) {
  g.strokeStyle = colour
  g.lineWidth = 1
  g.beginPath()
  for (let i = x + step; i < x + w - 1e-6; i += step) { g.moveTo(i * PX, z * PX); g.lineTo(i * PX, (z + d) * PX) }
  for (let j = z + step; j < z + d - 1e-6; j += step) { g.moveTo(x * PX, j * PX); g.lineTo((x + w) * PX, j * PX) }
  g.stroke()
}

/** Planks along the patch's long side, each a slightly different tone, with staggered end joints. */
function paintOak(p: Paint) {
  const { g, rand, x, z, w, d } = p
  const along = w >= d, plank = 0.16
  const [length, across] = along ? [w, d] : [d, w]
  g.fillStyle = rgb(FINISH.oak, 0.8)   // shows through as the joints
  g.fillRect(x * PX, z * PX, w * PX, d * PX)
  for (let k = 0; k * plank < across - 1e-6; k++) {
    const a0 = k * plank, a1 = Math.min(across, a0 + plank)
    let s = -rand() * 2
    while (s < length) {
      const s1 = Math.min(length, s + 1.2 + rand() * 1.4)
      g.fillStyle = rgb(FINISH.oak, 0.93 + rand() * 0.12)
      const [rx, rz, rw, rd] = along ? [x + Math.max(0, s), z + a0, s1 - Math.max(0, s), a1 - a0] : [x + a0, z + Math.max(0, s), a1 - a0, s1 - Math.max(0, s)]
      g.fillRect(rx * PX, rz * PX, rw * PX - 1, rd * PX - 1)    // the 1 px left showing is the joint
      s = s1
    }
  }
}

/** Carpet tiles laid in quarter turns, so neighbouring tiles catch the light differently. */
function paintCarpet(p: Paint, base: string) {
  const { g, x, z, w, d } = p
  const tile = 0.5
  for (let i = 0; i * tile < w - 1e-6; i++) for (let j = 0; j * tile < d - 1e-6; j++) {
    g.fillStyle = rgb(base, (i + j) % 2 ? 0.985 : 1.012)
    g.fillRect((x + i * tile) * PX, (z + j * tile) * PX, Math.min(tile, w - i * tile) * PX, Math.min(tile, d - j * tile) * PX)
  }
  g.strokeStyle = rgb(base, 0.72)    // a darker trim where the carpet meets the hard floor
  g.lineWidth = 2
  g.strokeRect(x * PX + 1, z * PX + 1, w * PX - 2, d * PX - 2)
}

/** Entrance matting: dark ribs across the way in, inside a rubber border. */
function paintMat(p: Paint) {
  const { g, x, z, w, d } = p
  g.fillStyle = '#2f3236'
  g.fillRect(x * PX, z * PX, w * PX, d * PX)
  g.fillStyle = FINISH.mat
  for (let i = 0.08; i < w - 0.08; i += 0.05) g.fillRect((x + i) * PX, (z + 0.08) * PX, 0.03 * PX, (d - 0.16) * PX)
}

/** Terrazzo: pale ground with stone chips and large square tiles. */
function paintTerrazzo(p: Paint) {
  const { g, rand, x, z, w, d } = p
  g.fillStyle = FINISH.terrazzo
  g.fillRect(x * PX, z * PX, w * PX, d * PX)
  const chips = ['#8e8981', '#b5aea2', '#f5f2ed', '#6f6a63', '#c9a98a']
  for (let i = 0, n = w * d * 70; i < n; i++) {
    g.fillStyle = chips[Math.floor(rand() * chips.length)]
    const r = 0.6 + rand() * 1.6
    g.fillRect((x + rand() * w) * PX, (z + rand() * d) * PX, r, r)
  }
  joints(p, 0.8, 'rgba(120,114,106,0.28)')
}

function useFloorTexture() {
  return useMemo(() => {
    const w = WORLD.width * PX, d = WORLD.depth * PX
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = d
    const g = canvas.getContext('2d')!
    let seed = 7
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    // polished concrete: a faint mottle and 2 m slabs
    g.fillStyle = PALETTE.floor
    g.fillRect(0, 0, w, d)
    for (let i = 0; i < 7000; i++) {
      g.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '86,88,92'},${0.01 + rand() * 0.016})`
      g.beginPath()
      g.arc(rand() * w, rand() * d, 5 + rand() * 40, 0, Math.PI * 2)
      g.fill()
    }
    joints({ g, rand, x: 0, z: 0, w: WORLD.width, d: WORLD.depth }, 2, 'rgba(110,112,116,0.2)')
    for (const f of WORLD.floors) {
      const p = { g, rand, x: f.x, z: f.z, w: f.w, d: f.d }
      if (f.finish === 'oak') paintOak(p)
      else if (f.finish === 'terrazzo') paintTerrazzo(p)
      else if (f.finish === 'mat') paintMat(p)
      else if (f.finish === 'light') {
        g.fillStyle = FINISH.light
        g.fillRect(f.x * PX, f.z * PX, f.w * PX, f.d * PX)
        joints(p, 2, 'rgba(120,122,126,0.16)')
      } else paintCarpet(p, FINISH[f.finish])
    }
    // fine grain over every finish, so nothing reads as flat paint
    const image = g.getImageData(0, 0, w, d)
    for (let i = 0; i < image.data.length; i += 4) {
      const n = (rand() - 0.5) * 9
      image.data[i] += n
      image.data[i + 1] += n
      image.data[i + 2] += n
    }
    g.putImageData(image, 0, 0)
    for (let x = 2; x < WORLD.width; x += 4) for (let z = 2; z < WORLD.depth; z += 4) {   // pools under the ceiling downlights
      const pool = g.createRadialGradient(x * PX, z * PX, 0, x * PX, z * PX, 1.9 * PX)
      pool.addColorStop(0, 'rgba(255,250,240,0.12)')
      pool.addColorStop(1, 'rgba(255,250,240,0)')
      g.fillStyle = pool
      g.fillRect((x - 2) * PX, (z - 2) * PX, 4 * PX, 4 * PX)
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    return texture
  }, [])
}

/** Terrazzo needs chips of a centimetre or two, far finer than the floor texture's 2.5 cm pixels,
 * so its patches get their own plane with a repeating 1.6 m tile at 320 px/m on top. */
const TERRAZZO_TILE = 1.6

function useTerrazzoTile() {
  return useMemo(() => {
    const s = 512
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = s
    const g = canvas.getContext('2d')!
    g.fillStyle = FINISH.terrazzo
    g.fillRect(0, 0, s, s)
    let seed = 41
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const chips: [string, number][] = [['#8e8981', 0.3], ['#b5aea2', 0.3], ['#f5f2ed', 0.2], ['#6f6a63', 0.12], ['#c9a98a', 0.08]]
    for (let i = 0; i < 5200; i++) {
      let pick = rand(), colour = chips[0][0]
      for (const [c, p] of chips) { if ((pick -= p) <= 0) { colour = c; break } }
      const r = 0.8 + rand() ** 2.2 * 4.2, x = rand() * s, y = rand() * s, turn = rand() * Math.PI
      g.fillStyle = colour
      for (const [dx, dy] of [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s]]) {   // wrap so the tile repeats seamlessly
        g.beginPath()
        g.ellipse(x + dx, y + dy, r, r * (0.55 + rand() * 0.4), turn, 0, Math.PI * 2)
        g.fill()
      }
    }
    g.strokeStyle = 'rgba(120,114,106,0.4)'          // 0.8 m tiles: joints on the edges and the middle
    g.lineWidth = 1.5
    for (const p of [0.75, s / 2, s - 0.75]) {
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.stroke()
      g.beginPath(); g.moveTo(0, p); g.lineTo(s, p); g.stroke()
    }
    const t = new THREE.CanvasTexture(canvas)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }, [])
}

function TerrazzoPatches() {
  const tile = useTerrazzoTile()
  const patches = WORLD.floors.filter((f) => f.finish === 'terrazzo')
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: tile, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 }), [tile])
  const geometry = useMemo(() => mergeGeometries(patches.map((f) => {
    const g = new THREE.PlaneGeometry(f.w, f.d).rotateX(-Math.PI / 2).translate(f.x + f.w / 2, 0.001, f.z + f.d / 2)
    const uv = g.getAttribute('uv') as THREE.BufferAttribute
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / TERRAZZO_TILE, -pos.getZ(i) / TERRAZZO_TILE)   // world-aligned tiles
    return g
  })), [patches])
  return <mesh geometry={geometry} material={material} receiveShadow />
}

type FloorEvents = { onPick?: (p: THREE.Vector3) => void; onHover?: (p: THREE.Vector3 | null) => void }

function Floor({ onPick, onHover }: FloorEvents) {
  const map = useFloorTexture()
  return (
    <mesh rotation-x={-Math.PI / 2} position={[WORLD.width / 2, 0, WORLD.depth / 2]} receiveShadow
      onPointerDown={(e) => { if (e.button === 0 && onPick) { e.stopPropagation(); onPick(e.point) } }}
      onPointerMove={onHover && ((e) => onHover(e.point))} onPointerOut={onHover && (() => onHover(null))}>
      <planeGeometry args={[WORLD.width, WORLD.depth]} />
      <meshStandardMaterial map={map} roughness={0.82} />
    </mesh>
  )
}

/** Does the ray from the avatar's chest towards the camera pass through this wall piece? */
function hides(piece: Obstacle, height: number) {
  const o = [avatar.x, 1.1, avatar.z], d = [VIEW_DIR.x, VIEW_DIR.y, VIEW_DIR.z]
  const lo = [piece.x, 0, piece.z], hi = [piece.x + piece.w, height, piece.z + piece.d]
  let t0 = 0, t1 = Infinity
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) return false; continue }
    let near = (lo[a] - o[a]) / d[a], far = (hi[a] - o[a]) / d[a]
    if (near > far) [near, far] = [far, near]
    t0 = Math.max(t0, near)
    t1 = Math.min(t1, far)
    if (t0 > t1) return false
  }
  return true
}

/** A solid or low wall piece in its own material so it can fade on its own. */
function SolidPiece({ piece, height }: { piece: Obstacle; height: number }) {
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: PALETTE.wallWhite, roughness: 0.92, transparent: true }), [])
  useFrame((_, dt) => {
    const target = !OVERVIEW && hides(piece, height) ? FADED : 1
    material.opacity += (target - material.opacity) * Math.min(1, dt * 8)
    material.depthWrite = material.opacity > 0.95
  })
  return (
    <mesh position={[piece.x + piece.w / 2, height / 2, piece.z + piece.d / 2]} material={material} castShadow receiveShadow>
      <boxGeometry args={[piece.w, height, piece.d]} />
    </mesh>
  )
}

/** Every glass run in two merged meshes: panes, and black head, sill and posts. */
function useGlass(walls: Wall[]) {
  return useMemo(() => {
    const panes: THREE.BufferGeometry[] = []
    const frames: THREE.BufferGeometry[] = []
    for (const wall of walls) {
      const horizontal = wall.from[1] === wall.to[1]
      for (const p of wallPieces(wall)) {
        const length = horizontal ? p.w : p.d
        const start = horizontal ? p.x : p.z
        const across = horizontal ? p.z + p.d / 2 : p.x + p.w / 2
        const at = (s: number): [number, number] => (horizontal ? [s, across] : [across, s])
        const [cx, cz] = at(start + length / 2)
        const [lx, lz] = horizontal ? [length, FRAME] : [FRAME, length]
        panes.push(box(horizontal ? length : 0.012, wall.height, horizontal ? 0.012 : length, cx, wall.height / 2, cz))
        frames.push(box(lx, FRAME, lz, cx, wall.height - FRAME / 2, cz), box(lx, FRAME, lz, cx, FRAME / 2, cz))
        const posts = Math.max(1, Math.round(length / GLASS_PANEL))
        for (let i = 0; i <= posts; i++) {
          const [px, pz] = at(start + (i * length) / posts)
          frames.push(box(FRAME, wall.height, FRAME, px, wall.height / 2, pz))
        }
      }
    }
    const { x, from, to, mullionEvery } = WORLD.window
    const h = WORLD.wallHeight
    panes.push(box(0.012, h, to - from, x + 0.03, h / 2, (from + to) / 2))
    for (let z = from; z <= to + 1e-6; z += mullionEvery) frames.push(box(0.07, h, 0.07, x + 0.03, h / 2, z))
    frames.push(box(0.08, 0.08, to - from, x + 0.03, 0.04, (from + to) / 2), box(0.1, 0.12, to - from, x + 0.03, h - 0.06, (from + to) / 2))
    return { panes: mergeGeometries(panes), frames: mergeGeometries(frames) }
  }, [walls])
}

/** Exposed services along the top edge of the back and window walls (DESIGN_SPEC 1, "Ceiling"). */
function Services() {
  const h = WORLD.wallHeight
  const geometry = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [box(WORLD.width, 0.32, 0.45, WORLD.width / 2, h - 0.25, 0.55)]
    for (let x = 1.5; x < WORLD.width; x += 2.4) parts.push(box(0.09, 0.14, 0.09, x, h - 0.48, 0.78))
    parts.push(new THREE.CylinderGeometry(0.09, 0.09, WORLD.depth, 16).rotateX(Math.PI / 2).translate(WORLD.width - 0.6, h - 0.18, WORLD.depth / 2))
    return mergeGeometries(parts.map((g) => g.toNonIndexed()))
  }, [h])
  return <mesh geometry={geometry} material={frameMaterial} castShadow />
}

/** Ceiling and the open space above the low walls: they block the sun but are never drawn. */
function ShadowShell() {
  const { width: w, depth: d, wallHeight: h } = WORLD
  return (
    <group>
      <mesh position={[w / 2, h + 0.06, d / 2]} material={shadowOnly} castShadow><boxGeometry args={[w + 2, 0.12, d + 2]} /></mesh>
      <mesh position={[w / 2, h / 2 + 0.5, d + 0.06]} material={shadowOnly} castShadow><boxGeometry args={[w + 2, h, 0.12]} /></mesh>
      <mesh position={[-0.06, h / 2 + 0.5, d / 2]} material={shadowOnly} castShadow><boxGeometry args={[0.12, h, d + 2]} /></mesh>
    </group>
  )
}

/** The cut-away walls' tops in the dark of an architectural section, so the cut reads as a cut. */
const SECTION = '#2b2e33'

function SectionCaps() {
  const geometry = useMemo(() => mergeGeometries(WORLD.walls.filter((w) => w.kind === 'low').flatMap((wall) =>
    wallPieces(wall).map((p) => box(p.w + 0.004, 0.012, p.d + 0.004, p.x + p.w / 2, wall.height + 0.006, p.z + p.d / 2)))), [])
  return <mesh geometry={geometry}><meshStandardMaterial color={SECTION} roughness={0.8} /></mesh>
}

export default function Architecture({ onPick, onHover }: FloorEvents) {
  const solid = WORLD.walls.filter((w) => w.kind !== 'glass')
  const glass = useGlass(WORLD.walls.filter((w) => w.kind === 'glass'))
  return (
    <group>
      <Floor onPick={onPick} onHover={onHover} />
      <TerrazzoPatches />
      {solid.flatMap((wall) => wallPieces(wall).map((p) => <SolidPiece key={p.id} piece={p} height={wall.height} />))}
      <SectionCaps />
      <mesh geometry={glass.panes} material={glassMaterial} />
      <mesh geometry={glass.frames} material={frameMaterial} castShadow />
      <Services />
      <ShadowShell />
    </group>
  )
}
