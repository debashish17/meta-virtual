import { WORLD } from '@office/shared'

/**
 * The city around the office, generated once from a fixed seed: a street grid, pavements, and on
 * each block a few buildings or a small park, with street trees, lamps and parked cars. Metres, on
 * the office's axes; the office stands at street level on its own block (x -6..70, z -6..46).
 *
 * Anything west or south of the office stands between it and the camera, so it is kept low enough
 * never to hide the inside: from there the view ray climbs one metre per metre, and the nearest
 * such block is 18 m away, so 12 m buildings and 7 m trees on the far pavements are safe. On the
 * office's own south and west pavements only knee-high things stand.
 */

export const ROAD_Y = -0.3
export const WALK_Y = -0.15

export type Rect = { x0: number; z0: number; x1: number; z1: number }
export type FacadeStyle = 'ribbon' | 'grid' | 'glass'
/** A stacked part of a building: its footprint and the heights it spans above the pavement. */
export type Tier = Rect & { y0: number; y1: number }
export type RoofKind = 'gravel' | 'membrane' | 'green' | 'solar'
/** What stands on the top roof: plant units, a lift core, skylights, solar rows or planted beds. */
export type Roof = { kind: RoofKind; core: Rect | null; skylights: Rect[]; panels: Rect[]; beds: Rect[] }
export type Building = Rect & { h: number; style: FacadeStyle; colour: string; units: Rect[]; tiers: Tier[]; roof: Roof }
export type Tree = { x: number; z: number; trunk: number; crown: number; tint: number }
export type Car = { x: number; z: number; along: 'x' | 'z'; colour: string; speed?: number }   // speed (m/s, signed along the axis): driving
export type Block = Rect & { office: boolean; park: Rect[]; buildings: Building[] }

const { width: W, depth: D } = WORLD
const X_ROADS: [number, number][] = [[-70, -58], [-18, -6], [70, 82], [122, 134], [176, 188]]
const Z_ROADS: [number, number][] = [[-72, -60], [-18, -6], [46, 58], [106, 118]]
export const EXTENT: Rect = { x0: -130, z0: -140, x1: 250, z1: 180 }
const PAVEMENT = 3.5

const FACADES: Record<FacadeStyle, string[]> = {
  ribbon: ['#efebe3', '#e4ddd0', '#d9d4ca', '#3e4247'],                    // white render, stone, charcoal panel
  grid: ['#d8c29d', '#b26b4f', '#7d4b3c', '#e4ddd0', '#c9a582'],          // sandstone, brick, dark brick
  glass: ['#9db9c8', '#8fa3b3', '#a9bcc6', '#7f96a6'],
}
const CAR_COLOURS = ['#e9e5dc', '#2f4a6b', '#8c9aa3', '#3b3f44', '#b5523e', '#6f8f7a', '#f2f2ef', '#e9e5dc']
const TAXI = '#e2b640'

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
}

/** Cells between consecutive roads, along one axis. */
function cells(roads: [number, number][], from: number, to: number): [number, number][] {
  const out: [number, number][] = []
  let start = from
  for (const [a, b] of roads) { out.push([start, a]); start = b }
  out.push([start, to])
  return out
}

/** Distance from a rectangle to the office's footprint. */
const fromOffice = (r: Rect) => Math.hypot(Math.max(0, r.x0 - W, -r.x1), Math.max(0, r.z0 - D, -r.z1))
/** West or south of the office: between it and the camera. */
const cameraSide = (r: Rect) => r.x0 < W && (r.x1 <= 0 || r.z0 >= D)

function splitLots(r: Rect, rand: () => number): Rect[] {
  const inner = { x0: r.x0 + PAVEMENT + 0.5, z0: r.z0 + PAVEMENT + 0.5, x1: r.x1 - PAVEMENT - 0.5, z1: r.z1 - PAVEMENT - 0.5 }
  const alongX = inner.x1 - inner.x0 >= inner.z1 - inner.z0
  const length = alongX ? inner.x1 - inner.x0 : inner.z1 - inner.z0
  const n = Math.max(1, Math.round(length / (16 + rand() * 8)))
  const gap = 2, size = (length - gap * (n - 1)) / n
  return Array.from({ length: n }, (_, i) => {
    const a = (alongX ? inner.x0 : inner.z0) + i * (size + gap)
    return alongX ? { ...inner, x0: a, x1: a + size } : { ...inner, z0: a, z1: a + size }
  })
}

/** The block across the road from the windows: kept low so its shadow ends on the road and the
 * morning sun still reaches the office. */
const facingWindows = (r: Rect) => r.x0 >= W && r.x0 < W + 30 && r.z0 < D && r.z1 > 0

/** Roof furniture on a building's top tier, kept clear of its plant units. */
function roofKit(top: Rect, h: number, units: Rect[], rand: () => number): Roof {
  const kind: RoofKind = (['gravel', 'gravel', 'membrane', 'green', 'solar'] as const)[Math.floor(rand() * 5)]
  const [w, d] = [top.x1 - top.x0, top.z1 - top.z0]
  const clear = (r: Rect) => units.every((u) => r.x1 < u.x0 - 0.5 || r.x0 > u.x1 + 0.5 || r.z1 < u.z0 - 0.5 || r.z0 > u.z1 + 0.5)
  const core = h > 14 && w > 8 && d > 8
    ? { x0: top.x1 - 4.2, z0: top.z0 + 1.2, x1: top.x1 - 1.2, z1: top.z0 + 4.2 } : null
  const free = (r: Rect) => clear(r) && (!core || r.x1 < core.x0 - 0.5 || r.z0 > core.z1 + 0.5)
  const skylights: Rect[] = [], panels: Rect[] = [], beds: Rect[] = []
  if (kind === 'solar') {
    for (let z = top.z0 + 1.5; z + 1.2 < top.z1 - 1; z += 2.1) {
      const r = { x0: top.x0 + 1.2, z0: z, x1: top.x0 + 1.2 + Math.min(w - 2.4, 12), z1: z + 1.2 }
      if (free(r)) panels.push(r)
    }
  } else if (kind === 'green') {
    for (let i = 0; i < 3; i++) {
      const bw = 3 + rand() * Math.min(6, w / 2), bd = 2 + rand() * Math.min(4, d / 2)
      const r = { x0: top.x0 + 1 + rand() * Math.max(0, w - bw - 2), z0: top.z0 + 1 + rand() * Math.max(0, d - bd - 2) }
      const bed = { ...r, x1: r.x0 + bw, z1: r.z0 + bd }
      if (free(bed)) beds.push(bed)
    }
  }
  if (h < 20) {
    for (let i = 0; i < 3; i++) {
      const x = top.x0 + 1.5 + rand() * Math.max(0, w - 4), z = top.z0 + 1.5 + rand() * Math.max(0, d - 3.5)
      const r = { x0: x, z0: z, x1: x + 1.6, z1: z + 1.0 }
      if (free(r) && panels.every((p) => r.z1 < p.z0 || r.z0 > p.z1) && beds.every((b) => r.x1 < b.x0 || r.x0 > b.x1 || r.z1 < b.z0 || r.z0 > b.z1)) skylights.push(r)
    }
  }
  return { kind, core, skylights, panels, beds }
}

function building(lot: Rect, block: Rect, rand: () => number): Building {
  let h: number
  if (cameraSide(block)) h = 4 + rand() * 8
  else if (facingWindows(block)) h = 5 + rand() * 4
  else {
    h = 8 + rand() * 24
    if (rand() < (fromOffice(block) > 60 ? 0.35 : 0.15)) h = 40 + rand() * 55
  }
  const style: FacadeStyle = h > 40 && rand() < 0.7 ? 'glass' : (['ribbon', 'grid', 'glass'] as const)[Math.floor(rand() * 3)]
  const colours = FACADES[style]
  // massing: tall buildings stand on a podium and step back; the tallest step in again near the top
  const inset = (r: Rect, d: number): Rect => ({ x0: r.x0 + d, z0: r.z0 + d, x1: r.x1 - d, z1: r.z1 - d })
  const tiers: Tier[] = []
  const room = Math.min(lot.x1 - lot.x0, lot.z1 - lot.z0)
  if (h > 24 && room > 12) {
    const podium = 7.2 + Math.floor(rand() * 2) * 3.6
    const tower = inset(lot, 2 + rand() * 1.5)
    tiers.push({ ...lot, y0: 0, y1: podium })
    if (h > 55 && room > 18) {
      const crown = h - 7.2 - Math.floor(rand() * 2) * 3.6
      tiers.push({ ...tower, y0: podium, y1: crown }, { ...inset(tower, 1.5 + rand()), y0: crown, y1: h })
    } else tiers.push({ ...tower, y0: podium, y1: h })
  } else tiers.push({ ...lot, y0: 0, y1: h })
  const top = tiers[tiers.length - 1]
  const units: Rect[] = []
  if (h < 40) {
    for (let i = 0, n = 1 + Math.floor(rand() * 3); i < n; i++) {    // plant rooms and AC units on the roof
      const w = 1.5 + rand() * 3, d = 1 + rand() * 2
      const x = top.x0 + 1 + rand() * Math.max(0, top.x1 - top.x0 - w - 2), z = top.z0 + 1 + rand() * Math.max(0, top.z1 - top.z0 - d - 2)
      units.push({ x0: x, z0: z, x1: x + w, z1: z + d })
    }
  }
  return { ...lot, h, style, colour: colours[Math.floor(rand() * colours.length)], units, tiers, roof: roofKit(top, h, units, rand) }
}

function generate() {
  const rand = rng(20261031)
  const blocks: Block[] = []
  for (const [x0, x1] of cells(X_ROADS, EXTENT.x0, EXTENT.x1)) {
    for (const [z0, z1] of cells(Z_ROADS, EXTENT.z0, EXTENT.z1)) {
      const r = { x0, z0, x1, z1 }
      const office = x0 < W && x1 > 0 && z0 < D && z1 > 0
      const block: Block = { ...r, office, park: [], buildings: [] }
      if (!office) {
        for (const lot of splitLots(r, rand)) {
          if (rand() < 0.14 && !cameraSide(r)) block.park.push(lot)
          else block.buildings.push(building(lot, r, rand))
        }
      }
      blocks.push(block)
    }
  }

  const trees: Tree[] = []
  const tree = (x: number, z: number, big = 1) =>
    trees.push({ x, z, trunk: 2.2 + rand() * 0.9, crown: (1.6 + rand() * 1.0) * big, tint: rand() })
  const bush = (x: number, z: number) => trees.push({ x, z, trunk: 0.05, crown: 0.45 + rand() * 0.3, tint: rand() })

  // planted beds along the office's window side, with gaps for paths and a bench at each
  const beds: Rect[] = [], benches: Rect[] = []
  for (let z = 1; z < D - 1; z += 10) {
    const bed = { x0: W + 2.4, z0: z, x1: W + 5.4, z1: z + 8 }
    beds.push(bed)
    benches.push({ x0: W + 1.75, z0: z + 3.1, x1: W + 2.2, z1: z + 4.9 })
    tree(W + 3.9, z + 2.2)
    tree(W + 3.9, z + 6.2)
    for (let i = 0; i < 7; i++) bush(bed.x0 + 0.5 + rand() * 2, z + 0.6 + rand() * 6.8)
  }

  // knee-high planters with shrubs on the office's camera-side pavements, clear of the way in
  const planters: Rect[] = []
  const shrubs = (r: Rect) => {
    for (const f of [0.25, 0.5, 0.75]) {
      const [x, z] = r.x1 - r.x0 > r.z1 - r.z0 ? [r.x0 + (r.x1 - r.x0) * f, (r.z0 + r.z1) / 2] : [(r.x0 + r.x1) / 2, r.z0 + (r.z1 - r.z0) * f]
      trees.push({ x, z, trunk: 0.55, crown: 0.32 + rand() * 0.12, tint: rand() })
    }
  }
  for (let x = 3; x < W - 2; x += 7) {
    if (x > 11 && x < 19) continue
    planters.push({ x0: x, z0: D + 1.6, x1: x + 1.8, z1: D + 2.1 })
  }
  for (let z = 3; z < D - 2; z += 7) planters.push({ x0: -2.1, z0: z, x1: -1.6, z1: z + 1.8 })
  planters.forEach(shrubs)

  for (const b of blocks) {
    const inset = 1.6
    const sides: [number, number, number, number, 'x' | 'z'][] = [
      [b.x0 + inset, b.z0 + inset, b.x1 - inset, b.z0 + inset, 'x'], [b.x0 + inset, b.z1 - inset, b.x1 - inset, b.z1 - inset, 'x'],
      [b.x0 + inset, b.z0 + inset, b.x0 + inset, b.z1 - inset, 'z'], [b.x1 - inset, b.z0 + inset, b.x1 - inset, b.z1 - inset, 'z'],
    ]
    for (const [ax, az, bx, bz, along] of sides) {
      // the office's pavements: street trees only on the north side (the window side has its beds)
      if (b.office && (along === 'x' ? az > D : true)) continue
      const length = along === 'x' ? bx - ax : bz - az
      for (let s = 4; s < length - 3; s += 9 + rand() * 2) tree(along === 'x' ? ax + s : ax, along === 'x' ? az : az + s)
    }
    for (const p of b.park) {
      for (let i = 0, n = Math.round(((p.x1 - p.x0) * (p.z1 - p.z0)) / 40); i < n; i++) {
        tree(p.x0 + 2 + rand() * (p.x1 - p.x0 - 4), p.z0 + 2 + rand() * (p.z1 - p.z0 - 4), 1.15)
      }
    }
  }

  const cars: Car[] = []
  const carColour = () => (rand() < 0.06 ? TAXI : CAR_COLOURS[Math.floor(rand() * CAR_COLOURS.length)])
  const park = (along: 'x' | 'z', fixed: number, from: number, to: number) => {
    for (let s = from + 3; s < to - 3; s += 5.5 + rand() * 2) {
      if (rand() < 0.45) continue
      cars.push(along === 'x' ? { x: s, z: fixed, along, colour: carColour() } : { x: fixed, z: s, along, colour: carColour() })
    }
  }
  for (const [a, b] of X_ROADS) for (const [z0, z1] of cells(Z_ROADS, EXTENT.z0, EXTENT.z1)) {
    park('z', a + 1.2, z0, z1)
    park('z', b - 1.2, z0, z1)
  }
  // traffic: cars driving in both lanes of every road, on the right-hand side
  // one speed per lane and even spacing, so cars in a lane never run into each other
  for (const [a, b] of X_ROADS) for (const lane of [-1, 1] as const) {
    const v = lane * (6 + rand() * 3)
    for (let i = 0; i < 4; i++) cars.push({ x: (a + b) / 2 - lane * 1.8, z: EXTENT.z0 + ((i + rand() * 0.5) / 4) * (EXTENT.z1 - EXTENT.z0), along: 'z', colour: carColour(), speed: v })
  }
  for (const [a, b] of Z_ROADS) for (const lane of [-1, 1] as const) {
    const v = lane * (6 + rand() * 3)
    for (let i = 0; i < 4; i++) cars.push({ x: EXTENT.x0 + ((i + rand() * 0.5) / 4) * (EXTENT.x1 - EXTENT.x0), z: (a + b) / 2 + lane * 1.8, along: 'x', colour: carColour(), speed: v })
  }
  for (const [a, b] of Z_ROADS) for (const [x0, x1] of cells(X_ROADS, EXTENT.x0, EXTENT.x1)) {
    park('x', a + 1.2, x0, x1)
    park('x', b - 1.2, x0, x1)
  }

  // street lamps on the pavement edges, never on the office's camera-side pavements
  const lamps: { x: number; z: number; along: 'x' | 'z'; out: 1 | -1 }[] = []
  for (const b of blocks) {
    const e = 0.5
    for (let x = b.x0 + 8; x < b.x1 - 8; x += 24) {
      lamps.push({ x, z: b.z0 + e, along: 'x', out: -1 })
      if (!b.office) lamps.push({ x, z: b.z1 - e, along: 'x', out: 1 })
    }
    for (let z = b.z0 + 8; z < b.z1 - 8; z += 24) {
      if (!b.office) lamps.push({ x: b.x0 + e, z, along: 'z', out: -1 })
      lamps.push({ x: b.x1 - e, z, along: 'z', out: 1 })
    }
  }
  return { blocks, trees, cars, lamps, beds, benches, planters }
}

export const CITY = generate()
export const ROADS = { x: X_ROADS, z: Z_ROADS, cells }
export { fromOffice }
