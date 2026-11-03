import { describe, expect, it } from "vitest";
import { AVATAR_RADIUS, WalkMap, type Point } from "./walk.js";
import { OBSTACLES, OFFICE_WALK, WORLD, ZONES, findPath, isWalkable, wallPieces } from "./index.js";

/**
 * A 10 x 10 m test floor: a wall across z = 5 with a 1 m door at x 4..5, a 2 x 1 m table in the
 * south half, and a closed 1 x 1 m box nobody can enter.
 */
const WALL = (x: number, w: number) => ({ id: "wall", x, z: 4.95, w, d: 0.1 });
const FLOOR = new WalkMap([
  WALL(0, 4), WALL(5, 5),
  { id: "table", x: 6, z: 7, w: 2, d: 1 },
  { id: "box:n", x: 1, z: 1, w: 1.2, d: 0.1 }, { id: "box:s", x: 1, z: 2.1, w: 1.2, d: 0.1 },
  { id: "box:w", x: 1, z: 1, w: 0.1, d: 1.2 }, { id: "box:e", x: 2.1, z: 1, w: 0.1, d: 1.2 },
], { width: 10, depth: 10 });

const clear = (map: WalkMap, path: Point[]) => path.every((p, i) => i === 0 || map.segmentClear(path[i - 1], p));
const length = (path: Point[]) => path.reduce((sum, p, i) => i === 0 ? 0 : sum + Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z), 0);

describe("walkability", () => {
  it("blocks walls, furniture and the floor's edge, inflated by the avatar's radius", () => {
    expect(FLOOR.isWalkable(2, 5)).toBe(false);                  // in the wall
    expect(FLOOR.isWalkable(2, 5 + 0.05 + AVATAR_RADIUS - 0.02)).toBe(false);  // body would touch it
    expect(FLOOR.isWalkable(2, 5.6)).toBe(true);
    expect(FLOOR.isWalkable(7, 7.5)).toBe(false);                // table
    expect(FLOOR.isWalkable(0.1, 8)).toBe(false);                // floor edge
    expect(FLOOR.isWalkable(-1, 8)).toBe(false);
  });

  it("lets the avatar through a door gap", () => {
    expect(FLOOR.isWalkable(4.5, 5)).toBe(true);
  });
});

describe("findPath", () => {
  it("goes round the wall through the door, with every leg clear", () => {
    const path = findPath({ x: 2, z: 3 }, { x: 2, z: 8 }, FLOOR);
    expect(path.length).toBeGreaterThan(2);
    expect(path[0]).toEqual({ x: 2, z: 3 });
    expect(path.at(-1)).toEqual({ x: 2, z: 8 });
    expect(path.some((p) => Math.abs(p.z - 5) < 0.6 && p.x > 3.9 && p.x < 5.1)).toBe(true);
    expect(clear(FLOOR, path)).toBe(true);
    expect(length(path)).toBeGreaterThan(5.5);
  });

  it("walks straight when nothing is in the way", () => {
    expect(findPath({ x: 2, z: 6 }, { x: 4, z: 9 }, FLOOR)).toEqual([{ x: 2, z: 6 }, { x: 4, z: 9 }]);
  });

  it("never steps through a thin wall whose band falls between grid cell centres", () => {
    // 6 cm glass at z = 5: inflated by the radius it spans 4.75..5.25, exactly between centres
    const glass = new WalkMap([{ id: "glass", x: 0, z: 4.97, w: 7, d: 0.06 }, { id: "glass", x: 8, z: 4.97, w: 2, d: 0.06 }],
      { width: 10, depth: 10 });
    const path = findPath({ x: 2, z: 3 }, { x: 2, z: 8 }, glass);
    expect(path.length).toBeGreaterThan(2);
    expect(clear(glass, path)).toBe(true);
    expect(path.some((p) => p.x > 7 && p.x < 8)).toBe(true);   // through the door at x 7..8
  });

  it("never cuts a corner, however shallow the graze", () => {
    // a line across the table's no-go corner (5.78, 6.78) that clips it by 2 mm, between any 10 cm samples
    const corner = { x: 6 - AVATAR_RADIUS, z: 7 - AVATAR_RADIUS };
    const across = (by: number) => [{ x: corner.x - 1, z: corner.z + 1 + by }, { x: corner.x + 1, z: corner.z - 1 + by }] as const;
    const [a, b] = across(0.002);
    expect(FLOOR.isWalkable(a.x, a.z) && FLOOR.isWalkable(b.x, b.z)).toBe(true);
    expect(FLOOR.segmentClear(a, b)).toBe(false);
    expect(FLOOR.segmentClear(...across(-0.002))).toBe(true);   // just outside the corner
  });

  it("still finds a way when the start is inside an obstacle's margin (e.g. after a server correction)", () => {
    const start = { x: 7, z: 6.9 };              // just inside the table's inflated edge
    expect(FLOOR.isWalkable(start.x, start.z)).toBe(false);
    const path = findPath(start, { x: 2, z: 8 }, FLOOR);
    expect(path.length).toBeGreaterThan(1);
    expect(clear(FLOOR, path.slice(1))).toBe(true);
  });

  it("refuses targets that are blocked or cannot be reached", () => {
    expect(findPath({ x: 2, z: 6 }, { x: 7, z: 7.5 }, FLOOR)).toEqual([]);   // inside the table
    expect(findPath({ x: 4, z: 8 }, { x: 1.6, z: 1.6 }, FLOOR)).toEqual([]); // inside the closed box
  });
});

describe("step", () => {
  it("moves at the given speed in open floor", () => {
    const p = FLOOR.step({ x: 5, z: 9.3 }, { x: 1, z: 0 }, 0.5, 2);
    expect(p.x).toBeCloseTo(6, 5);
    expect(p.z).toBeCloseTo(9.3, 5);
  });

  it("slides along a wall instead of stopping dead", () => {
    const start = { x: 2, z: 5.4 };
    const p = FLOOR.step(start, { x: Math.SQRT1_2, z: -Math.SQRT1_2 }, 0.5, 2);
    expect(p.x).toBeGreaterThan(start.x + 0.5);
    expect(p.z).toBeGreaterThanOrEqual(5.05 + AVATAR_RADIUS - 1e-9);
  });

  it("never ends inside an obstacle, whatever the input", () => {
    let p = { x: 3, z: 8 };
    let seed = 3;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2000; i++) {
      const a = rand() * Math.PI * 2;
      p = FLOOR.step(p, { x: Math.cos(a), z: Math.sin(a) }, 0.05 + rand() * 0.2, 4);
      expect(FLOOR.isWalkable(p.x, p.z), `step ${i} at (${p.x}, ${p.z})`).toBe(true);
    }
  });

  it("clamps speed so a client cannot sprint", () => {
    const p = FLOOR.step({ x: 5, z: 9.3 }, { x: 1, z: 0 }, 1, 100);
    expect(p.x - 5).toBeCloseTo(WalkMap.MAX_SPEED, 5);
  });
});

describe("office walkability", () => {
  const cellCentre = (z: { x: number; z: number; w: number; d: number }) => ({ x: z.x + z.w / 2, z: z.z + z.d / 2 });

  it("can walk straight through every glass room door, from outside to inside", () => {
    for (const wall of WORLD.walls.filter((w) => w.kind === "glass")) {
      for (const door of wall.doors) {
        const horizontal = wall.from[1] === wall.to[1];
        const start = Math.min(horizontal ? wall.from[0] : wall.from[1], horizontal ? wall.to[0] : wall.to[1]);
        const mid = start + door.at + door.width / 2;
        const at = (offset: number) => horizontal ? { x: mid, z: wall.from[1] + offset } : { x: wall.from[0] + offset, z: mid };
        expect(OFFICE_WALK.segmentClear(at(-0.6), at(0.6)), `${wall.id} door at ${mid}`).toBe(true);
      }
    }
  });

  it("cannot walk through walls, glass or furniture", () => {
    for (const piece of WORLD.walls.flatMap(wallPieces)) {
      const c = cellCentre(piece);
      expect(isWalkable(c.x, c.z), piece.id).toBe(false);
    }
    for (const o of OBSTACLES.filter((ob) => ob.id === "workstation.bench-desk-4")) {
      const c = cellCentre(o);
      expect(isWalkable(c.x, c.z), `desk at (${c.x}, ${c.z})`).toBe(false);
    }
  });

  it("reaches every room from the entrance", () => {
    const entrance = WORLD.spawn;
    expect(isWalkable(entrance.x, entrance.z)).toBe(true);
    for (const zone of ZONES) {
      const inside = { x: zone.x + zone.w / 2, z: zone.z + zone.d / 2 };
      const target = isWalkable(inside.x, inside.z) ? inside : OFFICE_WALK.nearestWalkable(inside, Math.max(zone.w, zone.d) / 2);
      expect(target, `${zone.id} has walkable floor`).not.toBeNull();
      if (!target) continue;
      expect(findPath(entrance, target).length, `path to ${zone.id}`).toBeGreaterThan(0);
    }
  });
});

describe("step out of an obstacle's margin", () => {
  // the table spans x 6..8, z 7..8; its margin reaches AVATAR_RADIUS beyond that
  const inMargin = { x: 6 - AVATAR_RADIUS / 2, z: 7.5 };   // touching the table's west side

  it("walks out of a margin it stands in, never further in", () => {
    expect(FLOOR.isWalkable(inMargin.x, inMargin.z)).toBe(false);
    const inward = FLOOR.step(inMargin, { x: 1, z: 0 }, 0.05, 2);
    expect(inward).toEqual(inMargin);                      // towards the table: refused
    let p = inMargin;
    for (let i = 0; i < 4; i += 1) p = FLOOR.step(p, { x: -1, z: 0 }, 0.05, 2);
    expect(p.x).toBeLessThan(inMargin.x);                  // away from it: allowed
    expect(FLOOR.isWalkable(p.x, p.z)).toBe(true);         // and back on the floor
  });

  it("may move along the margin at the same depth, never deeper", () => {
    const along = FLOOR.step(inMargin, { x: 0, z: 1 }, 0.05, 2);
    expect(along.z).toBeGreaterThan(inMargin.z);           // along the table's side
    expect(FLOOR.depth(along.x, along.z)).toBeLessThanOrEqual(FLOOR.depth(inMargin.x, inMargin.z) + 1e-9);
  });

  it("still never ends inside an obstacle when starting on the floor", () => {
    const start = { x: 5.5, z: 7.5 };
    for (let i = 0; i < 20; i += 1) {
      const next = FLOOR.step(start, { x: 1, z: 0 }, 0.05 * i, 2);
      expect(FLOOR.isWalkable(next.x, next.z)).toBe(true);
    }
  });
});
