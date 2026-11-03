import { describe, expect, it } from "vitest";
import { Swivel } from "./chairs";

const CHAIR = { x: 10, z: 5, rotY: 0 }; // facing +z, towards its desk
const run = (s: Swivel, seconds: number, sitter: () => { x: number; z: number; facing: number } | null) => {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
    const who = sitter();
    s.update(1 / 60, who ? [who] : []);
  }
};

describe("Swivel", () => {
  it("turns to face someone backing onto it from the side, then with them to the desk", () => {
    const s = new Swivel([CHAIR]);
    run(s, 0.5, () => ({ x: 10, z: 5, facing: Math.PI / 2 })); // sitting down, facing the side
    expect(s.angles[0]).toBeCloseTo(Math.PI / 2, 2);
    let facing = Math.PI / 2;
    run(s, 0.8, () => ({ x: 10, z: 5, facing: (facing -= (Math.PI / 2) / 48) })); // the swivel to the desk
    run(s, 0.3, () => ({ x: 10, z: 5, facing: 0 })); // typing
    expect(s.angles[0]).toBeCloseTo(0, 2);
  });

  it("follows the sitter closely through the swivel", () => {
    const s = new Swivel([CHAIR]);
    run(s, 0.5, () => ({ x: 10, z: 5, facing: Math.PI / 2 }));
    let facing = Math.PI / 2;
    let worst = 0;
    for (let k = 0; k < 48; k += 1) {
      facing -= Math.PI / 2 / 48;
      s.update(1 / 60, [{ x: 10, z: 5, facing }]);
      worst = Math.max(worst, Math.abs(s.angles[0] - facing));
    }
    expect(worst).toBeLessThan(0.15); // under 9 degrees behind the person
  });

  it("is not turned by people who are not on it", () => {
    const s = new Swivel([CHAIR]);
    run(s, 1, () => ({ x: 11, z: 5, facing: Math.PI / 2 })); // the next chair along
    expect(s.angles[0]).toBe(0);
  });

  it("turns back to its desk a little after the sitter leaves", () => {
    const s = new Swivel([CHAIR]);
    run(s, 1, () => ({ x: 10, z: 5, facing: Math.PI / 2 })); // stood up facing the side
    run(s, 0.5, () => null);
    expect(s.angles[0]).toBeCloseTo(Math.PI / 2, 2); // left as it was for a moment
    run(s, 3, () => null);
    expect(s.angles[0]).toBeCloseTo(0, 2);
  });

  it("takes the short way round", () => {
    const s = new Swivel([{ x: 0, z: 0, rotY: (3 * 180) / Math.PI }]);
    s.update(1 / 60, [{ x: 0, z: 0, facing: -3 }]);
    expect(Math.abs(s.angles[0])).toBeGreaterThan(3); // through pi, not back through 0
  });

  it("reports whether anything moved", () => {
    const s = new Swivel([CHAIR]);
    expect(s.update(1 / 60, [])).toBe(false);
    expect(s.update(1 / 60, [{ x: 10, z: 5, facing: 1 }])).toBe(true);
  });
});
