import { describe, expect, it } from "vitest";
import generated from "./catalogue.generated.json";
import { Catalogue, CatalogueItem } from "./schema.js";

const item = {
  id: "lounge.2-seater-sofa",
  name: "2 Seater Sofa",
  category: "lounge",
  kind: "part",
  family: "sofa",
  params: { seats: 2 },
  dimsMm: { w: 1600, d: 850, h: null },
  dimsText: "1600 x 850 mm",
  dimsOrigin: "label",
  subtitle: null,
  sources: [{
    board: "Office Lounge Seating Reference Board.png",
    section: "SOFAS",
    rawLabel: "2 Seater Sofa",
    origin: "board",
    labelBox: [65, 270, 135, 281],
    itemBox: [30, 150, 170, 262],
    crop: "/assets/catalogue/crops/office-lounge-seating-reference-board/2-seater-sofa.png",
  }],
};
const board = { file: item.sources[0].board, slug: "office-lounge-seating-reference-board", role: "catalogue", labels: 1, matched: 1, handAdded: 0 };

describe("catalogue schema", () => {
  it("accepts a well-formed part", () => {
    expect(CatalogueItem.safeParse(item).success).toBe(true);
  });

  it("rejects a part without a builder family", () => {
    expect(CatalogueItem.safeParse({ ...item, family: null }).success).toBe(false);
  });

  it("rejects a reference item that names a family", () => {
    expect(CatalogueItem.safeParse({ ...item, kind: "reference" }).success).toBe(false);
  });

  it("requires a size origin exactly when a size is present", () => {
    expect(CatalogueItem.safeParse({ ...item, dimsOrigin: null }).success).toBe(false);
    expect(CatalogueItem.safeParse({ ...item, dimsMm: null, dimsText: null }).success).toBe(false);
    expect(CatalogueItem.safeParse({ ...item, dimsMm: null, dimsText: null, dimsOrigin: null }).success).toBe(true);
  });

  it("rejects ids outside the manifest id pattern", () => {
    expect(CatalogueItem.safeParse({ ...item, id: "Lounge.2 seater" }).success).toBe(false);
  });

  it("rejects duplicate ids and unknown boards", () => {
    expect(Catalogue.safeParse({ schemaVersion: 1, boards: [board], items: [item, item] }).success).toBe(false);
    expect(Catalogue.safeParse({ schemaVersion: 1, boards: [], items: [item] }).success).toBe(false);
  });
});

describe("generated catalogue (blender-asset-pipeline/run.py catalog)", () => {
  const parsed = Catalogue.safeParse(generated);

  it("matches the schema", () => {
    expect(parsed.error?.issues ?? []).toEqual([]);
  });

  it("matches every label on a catalogue board to an object crop", () => {
    for (const b of parsed.data?.boards ?? []) {
      if (b.role === "catalogue") expect(b.matched, b.file).toBe(b.labels);
    }
  });
});
