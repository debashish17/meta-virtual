export const WORLD = {
  width: 12,
  depth: 10,
  cell: 0.5,
  start: [6, 8.4] as [number, number],
  customerDoor: [8.55, 2.35] as [number, number],
  projectDoor: [8.55, 5.65] as [number, number],
}

export type OfficeZoneId = 'customer' | 'project' | 'open'
export type Point = [number, number]
export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number }

// These footprints are the walk grid's source of truth. Furniture is placed
// against the same approximate bounds in WorldScene.tsx.
export const SOLID_RECTS: Rect[] = [
  // Perimeter: the south side is deliberately open as a camera cutaway.
  { minX: 0, maxX: 12, minZ: 0, maxZ: 0.25 },
  { minX: 0, maxX: 0.25, minZ: 0, maxZ: 10 },
  { minX: 11.75, maxX: 12, minZ: 0, maxZ: 10 },
  // Customer room glass walls. The west wall has a door gap from z=2 to 2.8.
  { minX: 7.85, maxX: 8.05, minZ: 0.4, maxZ: 1.95 },
  { minX: 7.85, maxX: 8.05, minZ: 2.85, maxZ: 3.45 },
  { minX: 8, maxX: 11.75, minZ: 3.35, maxZ: 3.55 },
  // Project room. Its west-side door faces the shared aisle.
  { minX: 7.85, maxX: 8.05, minZ: 3.85, maxZ: 5.25 },
  { minX: 7.85, maxX: 8.05, minZ: 6.05, maxZ: 7.0 },
  { minX: 8, maxX: 11.75, minZ: 6.9, maxZ: 7.1 },
  // Kitchen counters and printer/storage footprints.
  { minX: 0.45, maxX: 3.05, minZ: 0.45, maxZ: 1.25 },
  { minX: 0.55, maxX: 1.6, minZ: 4.0, maxZ: 4.8 },
  // Workstation tables and chairs.
  { minX: 3.15, maxX: 4.65, minZ: 3.35, maxZ: 4.3 },
  { minX: 5.1, maxX: 6.6, minZ: 3.35, maxZ: 4.3 },
  { minX: 3.15, maxX: 4.65, minZ: 5.45, maxZ: 6.4 },
  { minX: 5.1, maxX: 6.6, minZ: 5.45, maxZ: 6.4 },
  // Customer room meeting table and chairs.
  { minX: 9.05, maxX: 10.85, minZ: 1.25, maxZ: 2.25 },
]

export const OFFICE_ZONES: Array<{ id: Exclude<OfficeZoneId, 'open'>; rect: Rect }> = [
  // Interiors inside the glass walls defined below. Door gaps are on the west side.
  { id: 'customer', rect: { minX: 8.05, maxX: 11.75, minZ: 0.25, maxZ: 3.35 } },
  { id: 'project', rect: { minX: 8.05, maxX: 11.75, minZ: 3.55, maxZ: 6.9 } },
]

export function zoneAt(point: Point): OfficeZoneId {
  const found = OFFICE_ZONES.find(({ rect }) => point[0] >= rect.minX && point[0] <= rect.maxX && point[1] >= rect.minZ && point[1] <= rect.maxZ)
  return found?.id ?? 'open'
}
type Cell = { x: number; z: number }

function columns() {
  return Math.round(WORLD.width / WORLD.cell)
}

function rows() {
  return Math.round(WORLD.depth / WORLD.cell)
}

function key(cell: Cell) {
  return `${cell.x},${cell.z}`
}

function cellCenter(cell: Cell): Point {
  return [cell.x * WORLD.cell + WORLD.cell / 2, cell.z * WORLD.cell + WORLD.cell / 2]
}

function inBounds(cell: Cell) {
  return cell.x >= 0 && cell.x < columns() && cell.z >= 0 && cell.z < rows()
}

function walkable(cell: Cell) {
  if (!inBounds(cell)) return false
  const [x, z] = cellCenter(cell)
  return !SOLID_RECTS.some((rect) => x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ)
}

function toCell(point: Point): Cell {
  return {
    x: Math.floor(point[0] / WORLD.cell),
    z: Math.floor(point[1] / WORLD.cell),
  }
}

function nearestWalkable(cell: Cell, maxRadius = 12): Cell | null {
  if (walkable(cell)) return cell
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    const candidates: Cell[] = []
    for (let dx = -radius; dx <= radius; dx += 1) {
      candidates.push({ x: cell.x + dx, z: cell.z - radius })
      candidates.push({ x: cell.x + dx, z: cell.z + radius })
    }
    for (let dz = -radius + 1; dz < radius; dz += 1) {
      candidates.push({ x: cell.x - radius, z: cell.z + dz })
      candidates.push({ x: cell.x + radius, z: cell.z + dz })
    }
    const found = candidates.find(walkable)
    if (found) return found
  }
  return null
}

function heuristic(a: Cell, b: Cell) {
  const dx = Math.abs(a.x - b.x)
  const dz = Math.abs(a.z - b.z)
  return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)
}

export function findPath(from: Point, to: Point): Point[] {
  const start = nearestWalkable(toCell(from))
  const goal = nearestWalkable(toCell(to))
  if (!start || !goal) return []
  if (start.x === goal.x && start.z === goal.z) return [cellCenter(goal)]

  const open = new Map<string, Cell>([[key(start), start]])
  const cameFrom = new Map<string, Cell>()
  const gScore = new Map<string, number>([[key(start), 0]])
  const fScore = new Map<string, number>([[key(start), heuristic(start, goal)]])
  const neighbors = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ]

  while (open.size > 0) {
    let current: Cell | undefined
    let best = Number.POSITIVE_INFINITY
    for (const candidate of open.values()) {
      const score = fScore.get(key(candidate)) ?? Number.POSITIVE_INFINITY
      if (score < best) {
        best = score
        current = candidate
      }
    }
    if (!current) break
    if (current.x === goal.x && current.z === goal.z) {
      const route = [current]
      let cursor = current
      while (cameFrom.has(key(cursor))) {
        cursor = cameFrom.get(key(cursor))!
        route.push(cursor)
      }
      route.reverse()
      return route.slice(1).map(cellCenter)
    }

    open.delete(key(current))
    for (const [dx, dz] of neighbors) {
      const next = { x: current.x + dx, z: current.z + dz }
      if (!walkable(next)) continue
      // Prevent diagonal movement through the corner of a desk or wall.
      if (dx !== 0 && dz !== 0 && (!walkable({ x: current.x + dx, z: current.z }) || !walkable({ x: current.x, z: current.z + dz }))) continue
      const nextKey = key(next)
      const tentative = (gScore.get(key(current)) ?? Number.POSITIVE_INFINITY) + (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1)
      if (tentative >= (gScore.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue
      cameFrom.set(nextKey, current)
      gScore.set(nextKey, tentative)
      fScore.set(nextKey, tentative + heuristic(next, goal))
      open.set(nextKey, next)
    }
  }
  return []
}

export function gridCells(): Point[] {
  const cells: Point[] = []
  for (let x = 0; x < columns(); x += 1) {
    for (let z = 0; z < rows(); z += 1) {
      if (walkable({ x, z })) cells.push(cellCenter({ x, z }))
    }
  }
  return cells
}

