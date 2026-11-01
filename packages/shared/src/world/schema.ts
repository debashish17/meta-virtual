import { z } from "zod";
import { ItemId } from "../catalogue/schema.js";
import { LayoutPart, QuarterTurn } from "../layouts/schema.js";

/**
 * The office world (ARCHITECTURE.md section 3). Metres; origin at the north-west corner of the
 * floor; x grows east, z grows south, y is up. Rendering, walkability and zones all read this.
 */

export const ZoneType = z.enum(["meeting_room", "customer_room", "project_room", "kitchen", "open_plan"]);

export const Zone = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().min(1),
  type: ZoneType,
  x: z.number(), z: z.number(), w: z.number().positive(), d: z.number().positive(),
}).strict();

const point = z.tuple([z.number(), z.number()]);

/** An axis-aligned wall run from `from` to `to` (its centre line), with door gaps measured along it. */
export const Wall = z.object({
  id: z.string().min(1),
  kind: z.enum(["solid", "glass", "low"]),
  from: point,
  to: point,
  height: z.number().positive(),
  thickness: z.number().positive(),
  doors: z.array(z.object({ at: z.number().nonnegative(), width: z.number().positive() }).strict()),
}).strict().refine((w) => w.from[0] === w.to[0] || w.from[1] === w.to[1], { message: "walls are axis-aligned" });

/** A reference crop placed as an upright cut-out facing the camera (no 3D model). `width` is
 * its width in the picture plane; `facing` says which way the object's front points, so the
 * crop (drawn from the front-right) is mirrored when needed. */
export const SpriteProp = z.object({
  ref: ItemId,
  x: z.number(), z: z.number(), y: z.number().nonnegative(),
  width: z.number().positive(),
  facing: z.enum(["south", "west"]),
}).strict();

/** A floor finish laid over the concrete: wood on the streets, carpet under the team areas,
 * terrazzo in the café and reception, a lighter concrete along the windows, ribbed matting inside
 * the entrance. Later patches cover
 * earlier ones. */
export const Finish = z.enum(["oak", "terrazzo", "light", "carpet_slate", "carpet_sage", "carpet_sand", "carpet_stone",
  "carpet_charcoal", "mat"]);

export const FloorPatch = z.object({
  finish: Finish,
  x: z.number(), z: z.number(), w: z.number().positive(), d: z.number().positive(),
}).strict();

/** A keyboard, mouse and desk mat lying on a desk at one seat. At rotY 0 the person sits on the
 * +z side, facing -z; the mouse is on their right. */
export const Desktop = z.object({
  x: z.number(), z: z.number(),
  rotY: QuarterTurn,
}).strict();

export const WindowWall = z.object({
  x: z.number(), from: z.number(), to: z.number(),
  mullionEvery: z.number().positive(),
}).strict();

export const World = z.object({
  width: z.number().positive(),
  depth: z.number().positive(),
  wallHeight: z.number().positive(),
  zones: z.array(Zone),
  floors: z.array(FloorPatch),
  walls: z.array(Wall),
  window: WindowWall,
  spawn: z.object({ x: z.number(), z: z.number() }).strict(),   // where avatars enter
  furniture: z.array(LayoutPart),          // built catalogue parts, same convention as layouts
  sprites: z.array(SpriteProp),
  desktops: z.array(Desktop),
}).strict();

export const Obstacle = z.object({ id: z.string(), x: z.number(), z: z.number(), w: z.number(), d: z.number() }).strict();

export type ZoneType = z.infer<typeof ZoneType>;
export type Zone = z.infer<typeof Zone>;
export type Wall = z.infer<typeof Wall>;
export type SpriteProp = z.infer<typeof SpriteProp>;
export type Desktop = z.infer<typeof Desktop>;
export type Finish = z.infer<typeof Finish>;
export type FloorPatch = z.infer<typeof FloorPatch>;
export type WindowWall = z.infer<typeof WindowWall>;
export type World = z.infer<typeof World>;
export type Obstacle = z.infer<typeof Obstacle>;
