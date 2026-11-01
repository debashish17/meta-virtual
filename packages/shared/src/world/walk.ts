import type { Obstacle } from "./schema.js";

/**
 * Walkability, pathfinding and movement stepping (ARCHITECTURE.md sections 3 and 4). Client and
 * server build the same map from the same obstacles, so prediction and authority agree.
 *
 * - isWalkable is exact: the avatar's disc (AVATAR_RADIUS) must not touch any obstacle or the
 *   floor's edge.
 * - findPath runs A* on a 0.5 m grid of those checks, moving only between neighbouring cells
 *   joined by a clear straight line (a thin wall can fall between two cell centres), then pulls
 *   the path straight wherever the line of sight is clear.
 * - step moves a disc by speed x dt, sliding along whatever it meets, never into it.
 */

export const AVATAR_RADIUS = 0.22;
export const CELL = 0.5;

export type Point = { x: number; z: number };

const BUCKET = 2;   // spatial index cell, metres
const SUBSTEP = 0.05;
// neighbour offsets; bit k of a cell's edge mask says the straight step to DIRS[k] is clear
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class WalkMap {
  static readonly MAX_SPEED = 3.2;   // m/s; brisk walk with headroom for catch-up

  readonly cols: number;
  readonly rows: number;
  private readonly inflated: Obstacle[];
  private readonly buckets = new Map<number, number[]>();
  private readonly grid: Uint8Array;   // 1 = walkable cell centre
  private readonly edges: Uint8Array;  // per cell: which neighbours can be reached in a straight line

  constructor(obstacles: readonly Obstacle[], readonly bounds: { width: number; depth: number },
    readonly radius = AVATAR_RADIUS, readonly cell = CELL) {
    this.inflated = obstacles.map((o) => ({ ...o, x: o.x - radius, z: o.z - radius, w: o.w + 2 * radius, d: o.d + 2 * radius }));
    this.inflated.forEach((o, i) => {
      for (let bx = Math.floor(o.x / BUCKET); bx <= Math.floor((o.x + o.w) / BUCKET); bx++) {
        for (let bz = Math.floor(o.z / BUCKET); bz <= Math.floor((o.z + o.d) / BUCKET); bz++) {
          const key = this.bucketKey(bx, bz);
          const list = this.buckets.get(key);
          if (list) list.push(i);
          else this.buckets.set(key, [i]);
        }
      }
    });
    this.cols = Math.round(bounds.width / cell);
    this.rows = Math.round(bounds.depth / cell);
    this.grid = new Uint8Array(this.cols * this.rows);
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) this.grid[j * this.cols + i] = this.isWalkable((i + 0.5) * cell, (j + 0.5) * cell) ? 1 : 0;
    }
    this.edges = new Uint8Array(this.cols * this.rows);
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        if (!this.open(i, j)) continue;
        let mask = 0;
        DIRS.forEach(([di, dj], k) => {
          if (this.open(i + di, j + dj) && this.segmentClear(this.centre(i, j), this.centre(i + di, j + dj))) mask |= 1 << k;
        });
        this.edges[j * this.cols + i] = mask;
      }
    }
  }

  private bucketKey(bx: number, bz: number) {
    return (bx + 1024) * 4096 + (bz + 1024);
  }

  /** Can the avatar's disc stand at (x, z)? */
  isWalkable(x: number, z: number): boolean {
    const r = this.radius;
    if (x < r || z < r || x > this.bounds.width - r || z > this.bounds.depth - r) return false;
    const near = this.buckets.get(this.bucketKey(Math.floor(x / BUCKET), Math.floor(z / BUCKET)));
    if (!near) return true;
    for (const i of near) {
      const o = this.inflated[i];
      if (x > o.x && x < o.x + o.w && z > o.z && z < o.z + o.d) return false;
    }
    return true;
  }

  /** Is every point on the straight line a to b walkable? Exact: the line is tested against each
   * nearby obstacle's no-go rectangle (the same rectangles isWalkable uses), so it cannot slip past
   * a corner; both ends standing on the floor keep the whole line on it. */
  segmentClear(a: Point, b: Point): boolean {
    if (!this.isWalkable(a.x, a.z) || !this.isWalkable(b.x, b.z)) return false;
    const seen = new Set<number>();
    for (let bx = Math.floor(Math.min(a.x, b.x) / BUCKET); bx <= Math.floor(Math.max(a.x, b.x) / BUCKET); bx++) {
      for (let bz = Math.floor(Math.min(a.z, b.z) / BUCKET); bz <= Math.floor(Math.max(a.z, b.z) / BUCKET); bz++) {
        for (const i of this.buckets.get(this.bucketKey(bx, bz)) ?? []) {
          if (seen.has(i)) continue;
          seen.add(i);
          if (crossesBox(a, b, this.inflated[i])) return false;
        }
      }
    }
    return true;
  }

  /** Closest walkable point within `maxDistance` (searched on the grid), or null. */
  nearestWalkable(p: Point, maxDistance = 1): Point | null {
    if (this.isWalkable(p.x, p.z)) return { ...p };
    let best: Point | null = null;
    let bestD = maxDistance;
    const reach = Math.ceil(maxDistance / this.cell);
    const [ci, cj] = this.cellOf(p);
    for (let j = cj - reach; j <= cj + reach; j++) {
      for (let i = ci - reach; i <= ci + reach; i++) {
        if (!this.open(i, j)) continue;
        const q = this.centre(i, j);
        const dist = Math.hypot(q.x - p.x, q.z - p.z);
        if (dist <= bestD) [best, bestD] = [q, dist];
      }
    }
    return best;
  }

  private cellOf(p: Point): [number, number] {
    return [Math.floor(p.x / this.cell), Math.floor(p.z / this.cell)];
  }

  private centre(i: number, j: number): Point {
    return { x: (i + 0.5) * this.cell, z: (j + 0.5) * this.cell };
  }

  private open(i: number, j: number) {
    return i >= 0 && j >= 0 && i < this.cols && j < this.rows && this.grid[j * this.cols + i] === 1;
  }

  /** Shortest walkable route from `from` to `to` as waypoints, both ends included; [] when the
   * target is blocked or unreachable (the server rejects such moves). */
  findPath(from: Point, to: Point): Point[] {
    if (!this.isWalkable(to.x, to.z)) return [];
    if (this.segmentClear(from, to)) return [{ ...from }, { ...to }];
    // a start inside an obstacle's margin (e.g. after a correction) leaves by the nearest open point
    const exit = this.isWalkable(from.x, from.z) ? from : this.nearestWalkable(from, 1.5);
    if (!exit) return [];
    const start = this.nearestCell(exit);
    const goal = this.nearestCell(to);
    if (start === null || goal === null) return [];
    const cells = this.astar(start, goal);
    if (!cells) return [];
    const centres = cells.map((c) => this.centre(c % this.cols, Math.floor(c / this.cols)));
    const path = this.smooth([{ ...exit }, ...centres, { ...to }]);
    return exit === from ? path : [{ ...from }, ...path];
  }

  /** Index of the nearest open grid cell whose centre p can walk to in a straight line. */
  private nearestCell(p: Point): number | null {
    const [ci, cj] = this.cellOf(p);
    let best: number | null = null;
    let bestD = Infinity;
    for (let j = cj - 2; j <= cj + 2; j++) {
      for (let i = ci - 2; i <= ci + 2; i++) {
        if (!this.open(i, j)) continue;
        const c = this.centre(i, j);
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < bestD && this.segmentClear(p, c)) [best, bestD] = [j * this.cols + i, d];
      }
    }
    return best;
  }

  private astar(start: number, goal: number): number[] | null {
    const n = this.cols * this.rows;
    const g = new Float64Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    const gx = goal % this.cols, gz = Math.floor(goal / this.cols);
    const h = (c: number) => {
      const dx = Math.abs((c % this.cols) - gx), dz = Math.abs(Math.floor(c / this.cols) - gz);
      return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
    };
    g[start] = 0;
    heap.push(start, h(start));
    while (heap.size > 0) {
      const c = heap.pop();
      if (c === goal) {
        const out = [c];
        for (let k = came[c]; k !== -1; k = came[k]) out.push(k);
        return out.reverse();
      }
      if (closed[c]) continue;
      closed[c] = 1;
      const ci = c % this.cols, cj = Math.floor(c / this.cols);
      const mask = this.edges[c];
      for (let k = 0; k < DIRS.length; k++) {
        if (!(mask & (1 << k))) continue;
        const [di, dj] = DIRS[k];
        if (di && dj && !(this.open(ci + di, cj) && this.open(ci, cj + dj))) continue;  // no corner cutting
        const next = (cj + dj) * this.cols + ci + di;
        const cost = g[c] + (di && dj ? Math.SQRT2 : 1);
        if (cost < g[next]) {
          g[next] = cost;
          came[next] = c;
          heap.push(next, cost + h(next));
        }
      }
    }
    return null;
  }

  /** Drop waypoints the avatar can skip by walking straight (string pulling). */
  private smooth(points: Point[]): Point[] {
    const out = [points[0]];
    let anchor = 0;
    while (anchor < points.length - 1) {
      let far = points.length - 1;
      while (far > anchor + 1 && !this.segmentClear(points[anchor], points[far])) far--;
      out.push(points[far]);
      anchor = far;
    }
    return out;
  }

  /** Move a disc from `pos` along unit `dir` for `dt` seconds at `speed` (clamped), sliding
   * along obstacles. Never returns a blocked position when starting from a walkable one. */
  step(pos: Point, dir: Point, dt: number, speed: number): Point {
    const len = Math.hypot(dir.x, dir.z);
    if (len < 1e-9 || dt <= 0) return { ...pos };
    const distance = Math.min(speed, WalkMap.MAX_SPEED) * dt;   // callers clamp long frames
    const [ux, uz] = [dir.x / len, dir.z / len];
    let { x, z } = pos;
    const steps = Math.ceil(distance / SUBSTEP);
    const d = distance / steps;
    for (let k = 0; k < steps; k++) {
      if (this.isWalkable(x + ux * d, z + uz * d)) [x, z] = [x + ux * d, z + uz * d];
      else if (Math.abs(ux) > 1e-6 && this.isWalkable(x + ux * d, z)) x += ux * d;
      else if (Math.abs(uz) > 1e-6 && this.isWalkable(x, z + uz * d)) z += uz * d;
      else break;
    }
    return { x, z };
  }
}

class MinHeap {
  private items: number[] = [];
  private keys: number[] = [];
  get size() { return this.items.length; }
  push(item: number, key: number) {
    this.items.push(item);
    this.keys.push(key);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop()!, lastKey = this.keys.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.keys.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.keys.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}

/** Does the segment a-b pass through the open interior of box o? (slab test; touching an edge does not count) */
function crossesBox(a: Point, b: Point, o: Obstacle): boolean {
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[a.x, b.x - a.x, o.x, o.x + o.w], [a.z, b.z - a.z, o.z, o.z + o.d]]) {
    if (Math.abs(d) < 1e-12) {
      if (p <= lo || p >= hi) return false;
      continue;
    }
    let near = (lo - p) / d, far = (hi - p) / d;
    if (near > far) [near, far] = [far, near];
    t0 = Math.max(t0, near);
    t1 = Math.min(t1, far);
    if (t1 - t0 <= 1e-12) return false;
  }
  return true;
}
