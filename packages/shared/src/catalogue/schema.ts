import { z } from "zod";

/**
 * Contract for catalogue.generated.json, written by `python blender-asset-pipeline/run.py catalog`.
 * Each item is one labelled object from the reference boards; `sources` lists every board
 * occurrence (crop + label position) that was merged into it.
 */

export const CATEGORIES = [
  "architecture", "workstation", "seating", "meeting", "kitchen", "storage", "greenery",
  "tech", "partition", "utility", "lounge", "decor", "lighting",
] as const;

export const Category = z.enum(CATEGORIES);

/** part: built by a Blender family; composite: a layout of parts; reference: crop only. */
export const ItemKind = z.enum(["part", "composite", "reference"]);

/** `<category>.<slug>`, the id every catalogue, build and layout entry is keyed by. */
export const ItemId = z.string().regex(/^[a-z]+\.[a-z0-9-]+$/);

const mm = z.number().int().positive().nullable();
export const DimsMm = z.object({ w: mm, d: mm, h: mm }).strict();

const boxPx = z.tuple([z.number(), z.number(), z.number(), z.number()]);

/** board: label read off the board by OCR; hand: object with no printed label, named in corrections.toml. */
export const SourceOrigin = z.enum(["board", "hand"]);

export const ItemSource = z.object({
  board: z.string().min(1),
  section: z.string().nullable(),
  rawLabel: z.string().min(1),
  origin: SourceOrigin,
  labelBox: boxPx,
  itemBox: boxPx.nullable(),
  crop: z.string().startsWith("/assets/catalogue/crops/").nullable(),
}).strict();

export const CatalogueItem = z.object({
  id: ItemId,
  name: z.string().min(1),
  category: Category,
  kind: ItemKind,
  family: z.string().min(1).nullable(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  dimsMm: DimsMm.nullable(),
  dimsText: z.string().nullable(),
  /** label: size read off the board; correction: supplied or fixed in corrections.toml. */
  dimsOrigin: z.enum(["label", "correction"]).nullable(),
  subtitle: z.string().nullable(),
  sources: z.array(ItemSource).min(1),
}).strict().refine((item) => (item.kind === "part") === (item.family !== null), {
  message: "parts name a builder family; composites and references do not",
}).refine((item) => (item.dimsMm === null) === (item.dimsOrigin === null), {
  message: "dimsOrigin is set exactly when a size is",
});

export const BoardEntry = z.object({
  file: z.string().min(1),
  slug: z.string().min(1),
  role: z.enum(["catalogue", "style"]),
  labels: z.number().int().nonnegative(),      // printed labels read by OCR
  matched: z.number().int().nonnegative(),     // of those, matched to an object
  handAdded: z.number().int().nonnegative(),   // unlabelled objects named by hand
}).strict();

export const Catalogue = z.object({
  schemaVersion: z.literal(1),
  boards: z.array(BoardEntry),
  items: z.array(CatalogueItem),
}).strict().superRefine((catalogue, ctx) => {
  const boards = new Set(catalogue.boards.map((b) => b.file));
  const seen = new Set<string>();
  catalogue.items.forEach((item, i) => {
    if (seen.has(item.id)) ctx.addIssue({ code: "custom", path: ["items", i, "id"], message: `duplicate id ${item.id}` });
    seen.add(item.id);
    for (const source of item.sources) {
      if (!boards.has(source.board)) {
        ctx.addIssue({ code: "custom", path: ["items", i, "sources"], message: `unknown board ${source.board}` });
      }
    }
  });
});

export type Category = z.infer<typeof Category>;
export type ItemKind = z.infer<typeof ItemKind>;
export type SourceOrigin = z.infer<typeof SourceOrigin>;
export type DimsMm = z.infer<typeof DimsMm>;
export type ItemSource = z.infer<typeof ItemSource>;
export type CatalogueItem = z.infer<typeof CatalogueItem>;
export type Catalogue = z.infer<typeof Catalogue>;
