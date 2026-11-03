import { describe, expect, it } from "vitest";
import { OFFICE_WALK, WORLD } from "../world/index.js";
import { PERSON_GAP, inTheWay, keepApart } from "./apart.js";
import { TICK_DT } from "../net/index.js";
import { WALK_SPEED, spawnPlayer, stepPlayer } from "./index.js";

const at = { x: WORLD.spawn.x, z: WORLD.spawn.z };
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe("keepApart", () => {
  it("leaves a move alone when nobody is near", () => {
    const to = { x: at.x + 0.1, z: at.z };
    expect(keepApart(at, to, [{ x: at.x + 3, z: at.z }])).toEqual(to);
    expect(keepApart(at, to, [])).toEqual(to);
  });

  it("stops head on at PERSON_GAP, never inside it", () => {
    const other = { x: at.x + 0.55, z: at.z };
    const kept = keepApart(at, { x: at.x + 0.115, z: at.z }, [other]);
    expect(dist(kept, other)).toBeGreaterThanOrEqual(PERSON_GAP - 1e-9);
    expect(kept.x).toBeGreaterThan(at.x); // still came up to the gap
  });

  it("slides past someone off to the side instead of through them", () => {
    const other = { x: at.x + 0.6, z: at.z + 0.35 }; // ahead and to the side, 0.69 m away
    let p = { ...at };
    for (let i = 0; i < 12; i += 1) {
      p = keepApart(p, { x: p.x + 0.115, z: p.z }, [other]);
      expect(dist(p, other)).toBeGreaterThanOrEqual(PERSON_GAP - 1e-9);
    }
    expect(p.x).toBeGreaterThan(other.x + 0.3); // got past
  });

  it("two people meeting head on both keep right and pass", () => {
    let a = { x: at.x - 1.5, z: at.z };
    let b = { x: at.x + 1.5, z: at.z };
    for (let i = 0; i < 40; i += 1) {
      const na = keepApart(a, { x: a.x + 0.115, z: a.z }, [b]);
      const nb = keepApart(b, { x: b.x - 0.115, z: b.z }, [na]);
      a = na;
      b = nb;
      expect(dist(a, b)).toBeGreaterThanOrEqual(PERSON_GAP - 1e-9);
    }
    expect(a.x).toBeGreaterThan(at.x + 1); // both got through
    expect(b.x).toBeLessThan(at.x - 1);
  });

  it("walks round someone standing in the way", () => {
    const other = { x: at.x + 1, z: at.z };
    let p = { ...at };
    for (let i = 0; i < 40; i += 1) {
      p = keepApart(p, { x: p.x + 0.115, z: p.z }, [other]);
      expect(dist(p, other)).toBeGreaterThanOrEqual(PERSON_GAP - 1e-9);
    }
    expect(p.x).toBeGreaterThan(other.x + 0.5);
  });

  it("always lets someone already too close move away", () => {
    const other = { x: at.x + 0.2, z: at.z };
    const away = keepApart(at, { x: at.x - 0.1, z: at.z }, [other]);
    expect(away.x).toBeCloseTo(at.x - 0.1, 9);
  });

  it("never ends on unwalkable ground", () => {
    // wherever the sidestep would land, the result stays walkable when the start is
    for (const other of [{ x: at.x + 0.5, z: at.z }, { x: at.x, z: at.z + 0.5 }, { x: at.x - 0.5, z: at.z }]) {
      for (let k = 0; k < 8; k += 1) {
        const a = (k / 8) * Math.PI * 2;
        const kept = keepApart(at, { x: at.x + Math.cos(a) * 0.115, z: at.z + Math.sin(a) * 0.115 }, [other], OFFICE_WALK);
        expect(OFFICE_WALK.isWalkable(kept.x, kept.z)).toBe(true);
      }
    }
  });
});

describe("stepPlayer with other people", () => {
  it("does not walk through someone, and stands when pressed against them", () => {
    const p = spawnPlayer(at);
    const other = { x: at.x + 0.6, z: at.z };
    const walk = { kind: "intent" as const, dx: 1, dz: 0, run: false };
    for (let i = 0; i < 4; i += 1) stepPlayer(p, walk, TICK_DT, OFFICE_WALK, [other]);
    expect(dist(p, other)).toBeGreaterThanOrEqual(PERSON_GAP - 1e-9);
  });

  it("is unchanged with nobody about", () => {
    const a = spawnPlayer(at);
    const b = spawnPlayer(at);
    const walk = { kind: "intent" as const, dx: 1, dz: 0, run: false };
    stepPlayer(a, walk, TICK_DT);
    stepPlayer(b, walk, TICK_DT, OFFICE_WALK, []);
    expect(b).toEqual(a);
    expect(a.speed).toBeCloseTo(WALK_SPEED, 9);
  });
});

describe("inTheWay", () => {
  it("counts standing and walking people, not those in a chair", () => {
    for (const pose of ["stand", "walk", "jog", "talk", "phone", "interact"]) expect(inTheWay(pose)).toBe(true);
    for (const pose of ["sit_down", "seated", "type", "sit_talk", "stand_up"]) expect(inTheWay(pose)).toBe(false);
  });
});
