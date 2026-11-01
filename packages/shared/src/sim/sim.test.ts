import { describe, expect, it } from "vitest";
import { TICK_DT } from "../net/index.js";
import { OFFICE_WALK, WORLD, WalkMap } from "../world/index.js";
import { WALK_SPEED, spawnPlayer, stepPlayer, type SimPlayer, type StepInput } from "./index.js";

const DT = TICK_DT;
const step = (p: SimPlayer, input: StepInput | null, dt = DT) => stepPlayer(p, input, dt, OFFICE_WALK);

/** A blocked point (inside a wall or furniture) and a far reachable one, found deterministically. */
function probes() {
  let blocked: { x: number; z: number } | null = null;
  let far = { x: WORLD.spawn.x, z: WORLD.spawn.z };
  let farD = 0;
  for (let x = 0.5; x < WORLD.width; x += 0.5) {
    for (let z = 0.5; z < WORLD.depth; z += 0.5) {
      if (!OFFICE_WALK.isWalkable(x, z)) blocked ??= { x, z };
      else {
        const d = Math.hypot(x - WORLD.spawn.x, z - WORLD.spawn.z);
        if (d > farD && OFFICE_WALK.findPath(WORLD.spawn, { x, z }).length > 0) {
          far = { x, z };
          farD = d;
        }
      }
    }
  }
  return { blocked: blocked!, far, farD };
}

describe("stepPlayer", () => {
  it("walks, jogs, stops and stands still", () => {
    const p = spawnPlayer(WORLD.spawn);
    step(p, { kind: "intent", dx: 1, dz: 0, run: false });
    expect(p.pose).toBe("walk");
    expect(p.speed).toBeGreaterThan(0);
    expect(p.speed).toBeLessThanOrEqual(WALK_SPEED + 1e-9);
    expect(p.facing).toBeCloseTo(Math.PI / 2, 6);
    step(p, { kind: "intent", dx: 1, dz: 0, run: true });
    expect(p.pose).toBe("jog");
    step(p, { kind: "stop" });
    expect(p).toMatchObject({ pose: "stand", speed: 0, route: [] });
    const at = { x: p.x, z: p.z };
    step(p, { kind: "intent", dx: 0, dz: 0, run: false });
    expect(p.pose).toBe("stand");
    expect({ x: p.x, z: p.z }).toEqual(at);
  });

  it("never crosses walls, glass or furniture", () => {
    const starts = [WORLD.spawn, { x: 30, z: 20 }, { x: 8, z: 30 }, { x: 55, z: 8 }]
      .map((s) => OFFICE_WALK.nearestWalkable(s, 3))
      .filter((s): s is { x: number; z: number } => s !== null);
    expect(starts.length).toBeGreaterThan(0);
    for (const s of starts) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const p = spawnPlayer(s);
          let prev = { x: p.x, z: p.z };
          for (let t = 0; t < 8; t += DT) {
            step(p, { kind: "intent", dx, dz, run: (dx + dz) % 2 === 0 });
            expect(OFFICE_WALK.isWalkable(p.x, p.z), `(${p.x}, ${p.z})`).toBe(true);
            // no tunneling either: each tick moves at most one jog step
            expect(Math.hypot(p.x - prev.x, p.z - prev.z)).toBeLessThanOrEqual(WalkMap.MAX_SPEED * DT + 1e-9);
            prev = { x: p.x, z: p.z };
          }
        }
      }
    }
  });

  it("never exceeds the maximum speed, whatever the input", () => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const run of [false, true]) {
          const p = spawnPlayer(WORLD.spawn);
          const max = run ? WalkMap.MAX_SPEED : WALK_SPEED;
          for (let t = 0; t < 3; t += DT) {
            const before = { x: p.x, z: p.z };
            step(p, { kind: "intent", dx, dz, run });
            expect(p.speed).toBeLessThanOrEqual(max + 1e-9);
            expect(Math.hypot(p.x - before.x, p.z - before.z)).toBeLessThanOrEqual(max * DT + 1e-9);
          }
          // out-of-range and NaN-ish inputs are clamped, not trusted
          step(spawnPlayer(WORLD.spawn), { kind: "intent", dx: dx * 99, dz: dz * 99, run });
        }
      }
    }
    // diagonal intent is normalised, not faster
    const p = spawnPlayer(WORLD.spawn);
    step(p, { kind: "intent", dx: 1, dz: 1, run: false });
    expect(p.speed).toBeLessThanOrEqual(WALK_SPEED + 1e-9);
  });

  it("is deterministic: the same inputs always give the same result", () => {
    const inputs: (StepInput | null)[] = [
      { kind: "intent", dx: 1, dz: 0, run: false },
      { kind: "intent", dx: 1, dz: -1, run: true },
      null,
      { kind: "target", x: 30, z: 20 },
      null, null, null,
      { kind: "stop" },
      { kind: "intent", dx: 0, dz: 1, run: false },
    ];
    const run = () => {
      const p = spawnPlayer(WORLD.spawn, 1);
      const trace: number[] = [];
      for (const input of inputs) for (let k = 0; k < 5; k++) {
        step(p, input);
        trace.push(p.x, p.z, p.facing, p.speed, p.route.length);
      }
      return { p, trace };
    };
    const a = run(), b = run();
    expect(a.trace).toEqual(b.trace);
    expect(a.p).toEqual(b.p);
  });

  it("follows a target route and arrives; an unwalkable target leaves the player standing", () => {
    const { blocked, far, farD } = probes();
    expect(farD).toBeGreaterThan(10);
    const p = spawnPlayer(WORLD.spawn);
    step(p, { kind: "target", x: far.x, z: far.z });
    expect(p.route.length).toBeGreaterThan(0);
    expect(p.pose).toBe("walk");
    let prev = { x: p.x, z: p.z };
    for (let t = 0; t < 120 && p.route.length; t += DT) {
      step(p, null); // no new input: the route continues
      expect(OFFICE_WALK.isWalkable(p.x, p.z)).toBe(true);
      expect(OFFICE_WALK.segmentClear(prev, p)).toBe(true);
      prev = { x: p.x, z: p.z };
    }
    expect(p.route).toEqual([]);
    expect(Math.hypot(p.x - far.x, p.z - far.z)).toBeLessThan(0.1);
    expect(p.pose).toBe("stand");

    const q = spawnPlayer(WORLD.spawn);
    step(q, { kind: "target", x: blocked.x, z: blocked.z });
    expect(q.route).toEqual([]);
    expect(q.pose).toBe("stand");
    expect({ x: q.x, z: q.z }).toEqual({ x: WORLD.spawn.x, z: WORLD.spawn.z });
  });

  it("keeps every intent combination in range", () => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const p = spawnPlayer(WORLD.spawn);
        for (let t = 0; t < 5; t += DT) {
          step(p, { kind: "intent", dx, dz, run: true });
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.z).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(WORLD.width);
          expect(p.z).toBeLessThanOrEqual(WORLD.depth);
          expect(Number.isFinite(p.facing)).toBe(true);
        }
      }
    }
  });
});
