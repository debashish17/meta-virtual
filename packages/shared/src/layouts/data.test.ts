import { describe, expect, it } from "vitest";
import builds from "../catalogue/builds.generated.json";
import catalogue from "../catalogue/catalogue.generated.json";
import { Builds } from "../catalogue/builds.js";
import { Catalogue } from "../catalogue/schema.js";
import { LAYOUTS } from "./data.js";
import { Layouts } from "./schema.js";

const cat = Catalogue.parse(catalogue);
const kindOf = new Map(cat.items.map((i) => [i.id, i.kind]));
const size = new Map(Builds.parse(builds).items.map((b) => [b.id, b.measuredM]));
const CEILING = 3.0;
const SLACK = 0.01;   // m; measured sizes are rounded

describe("layouts", () => {
  it("match the schema", () => {
    expect(Layouts.safeParse(LAYOUTS).error?.issues ?? []).toEqual([]);
  });

  it("cover every board composite, and nothing else", () => {
    const composites = cat.items.filter((i) => i.kind === "composite").map((i) => i.id).sort();
    expect(LAYOUTS.map((l) => l.id).sort()).toEqual(composites);
  });

  it("place only built parts", () => {
    for (const layout of LAYOUTS) {
      for (const p of layout.parts) {
        expect(kindOf.get(p.part), `${layout.id}: ${p.part}`).toBe("part");
        expect(size.has(p.part), `${layout.id}: ${p.part} has no build`).toBe(true);
      }
    }
  });

  it("list only unbuilt reference items as pending", () => {
    for (const layout of LAYOUTS) {
      for (const id of layout.pending) expect(kindOf.get(id), `${layout.id}: ${id}`).toBe("reference");
    }
  });

  it("keep every part inside the footprint and under the ceiling", () => {
    for (const layout of LAYOUTS) {
      for (const p of layout.parts) {
        const m = size.get(p.part);
        if (!m) continue;
        const [w, d] = p.rotY % 180 === 0 ? [m.w, m.d] : [m.d, m.w];
        const where = `${layout.id}: ${p.part} at (${p.x}, ${p.z})`;
        expect(Math.abs(p.x) + w / 2, where).toBeLessThanOrEqual(layout.footprint.w / 2 + SLACK);
        expect(Math.abs(p.z) + d / 2, where).toBeLessThanOrEqual(layout.footprint.d / 2 + SLACK);
        expect(p.y + m.h, where).toBeLessThanOrEqual(CEILING + SLACK);
      }
    }
  });
});
