import { describe, expect, it } from "vitest";
import { AvatarLook, BODIES, BODY_IDS, CLOTHING, DEFAULT_LOOK, LOOK_PRESETS, MOVES, bodyOf, lookFromSeed } from "./look.js";

describe("avatar looks", () => {
  it("accepts every preset and the default", () => {
    expect(LOOK_PRESETS.length).toBeGreaterThanOrEqual(8);
    for (const p of LOOK_PRESETS) expect(AvatarLook.safeParse(p.look).error?.issues ?? [], p.name).toEqual([]);
    expect(AvatarLook.parse(DEFAULT_LOOK)).toEqual(DEFAULT_LOOK);
  });

  it("gives every preset a distinct look and name, and uses every body", () => {
    expect(new Set(LOOK_PRESETS.map((p) => JSON.stringify(p.look))).size).toBe(LOOK_PRESETS.length);
    expect(new Set(LOOK_PRESETS.map((p) => p.name)).size).toBe(LOOK_PRESETS.length);
    expect(new Set(LOOK_PRESETS.map((p) => p.look.body))).toEqual(new Set(BODY_IDS));
  });

  it("rejects colours outside the palette, unknown bodies and silly heights", () => {
    expect(AvatarLook.safeParse({ ...DEFAULT_LOOK, top: "#00ff00" }).success).toBe(false);
    expect(AvatarLook.safeParse({ ...DEFAULT_LOOK, body: "astronaut" }).success).toBe(false);
    expect(AvatarLook.safeParse({ ...DEFAULT_LOOK, height: 2.6 }).success).toBe(false);
    expect(AvatarLook.safeParse({ ...DEFAULT_LOOK, extra: 1 }).success).toBe(false);
  });

  it("derives a valid, repeatable look from any seed, and different seeds vary", () => {
    const looks = ["maya", "arjun", "u-1", "u-2", "u-3", "someone@example.com", ""].map(lookFromSeed);
    for (const l of looks) expect(AvatarLook.safeParse(l).success).toBe(true);
    expect(lookFromSeed("arjun")).toEqual(lookFromSeed("arjun"));
    expect(new Set(looks.map((l) => JSON.stringify(l))).size).toBe(looks.length);
    expect(CLOTHING).toContain(lookFromSeed("x").top);
  });
});

describe("baked bodies and moves", () => {
  it("has exactly one baked body per body id, each with recolourable clothes", () => {
    expect(BODIES.bodies.map((b) => b.id).sort()).toEqual([...BODY_IDS].sort());
    for (const id of BODY_IDS) {
      const roles = new Set(bodyOf(id).meshes.map((m) => m.role));
      for (const role of ["top", "bottom", "shoes"] as const) expect(roles.has(role), `${id} ${role}`).toBe(true);
      expect(bodyOf(id).url).toBe(`/assets/people/${id}.glb`);
    }
  });

  it("has every office move and the walking speeds", () => {
    const names = BODIES.moves.clips.map((c) => c.name);
    for (const m of MOVES) expect(names, m).toContain(m);
    expect(BODIES.moves.metresPerSecond.walk).toBeGreaterThan(0.6);
    expect(BODIES.moves.metresPerSecond.jog).toBeGreaterThan(BODIES.moves.metresPerSecond.walk);
  });
});
