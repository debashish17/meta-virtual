import { z } from "zod";
import { ItemId } from "../catalogue/schema.js";

/**
 * Layouts: the board's composites (rooms, sets, stations) as placements of built catalogue parts.
 *
 * Space is metres with the origin at the floor centre of the footprint: x to the right, z towards
 * the viewer (+z is the layout's front), y up. Each part's GLB origin is the floor centre of its
 * own footprint, so (x, y, z) is where that point lands. rotY is a quarter turn about +y, as
 * three.js `rotation.y` (counter-clockwise seen from above); at 0 the part's front faces +z.
 */

export const QuarterTurn = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);

export const LayoutPart = z.object({
  part: ItemId,
  x: z.number(),
  z: z.number(),
  y: z.number().nonnegative(),   // > 0 for things standing on furniture or mounted on a wall
  rotY: QuarterTurn,
}).strict();

export const Layout = z.object({
  id: ItemId,                    // the composite's catalogue id
  footprint: z.object({ w: z.number().positive(), d: z.number().positive() }).strict(),
  parts: z.array(LayoutPart).min(1),
  pending: z.array(ItemId),      // reference items the board shows here that no builder makes yet
  note: z.string().optional(),
}).strict();

export const Layouts = z.array(Layout).superRefine((layouts, ctx) => {
  const seen = new Set<string>();
  layouts.forEach((layout, i) => {
    if (seen.has(layout.id)) ctx.addIssue({ code: "custom", path: [i, "id"], message: `duplicate layout ${layout.id}` });
    seen.add(layout.id);
  });
});

export type QuarterTurn = z.infer<typeof QuarterTurn>;
export type LayoutPart = z.infer<typeof LayoutPart>;
export type Layout = z.infer<typeof Layout>;
