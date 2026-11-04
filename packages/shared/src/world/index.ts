import { z } from "zod";
import footprints from "./footprints.generated.json";
import spriteManifest from "./sprites.generated.json";
import { footprint, wallPieces } from "./compose.js";
import { OFFICE } from "./office.js";
import { World, type Obstacle, type Zone } from "./schema.js";
import { WalkMap, type Point } from "./walk.js";

export * from "./schema.js";
export * from "./rooms.js";
export { isoWidth, wallPieces } from "./compose.js";
export { AVATAR_RADIUS, CELL, WalkMap, type Point } from "./walk.js";

/** The office, validated. */
export const WORLD = World.parse(OFFICE);
export const ZONES: readonly Zone[] = WORLD.zones;
export const FURNITURE = WORLD.furniture;
export const SPRITES = WORLD.sprites;

// written by blender-asset-pipeline/run.py build: measured (w, d, h) of every built part
const SIZES = z.object({
  schemaVersion: z.literal(1),
  parts: z.record(z.string(), z.tuple([z.number().positive(), z.number().positive(), z.number().positive()])),
}).parse(footprints).parts;
const WALKABLE = /^lounge\.rug-/;   // flat on the floor
const WINDOW_T = 0.1;

/** Everything an avatar cannot walk through: wall runs minus door gaps, the window wall, and
 * the footprint of every floor-standing part (things on furniture or walls add nothing). */
export const OBSTACLES: readonly Obstacle[] = [
  ...WORLD.walls.flatMap(wallPieces),
  { id: "window", x: WORLD.window.x, z: WORLD.window.from, w: WINDOW_T, d: WORLD.window.to - WORLD.window.from },
  ...FURNITURE.filter((p) => p.y === 0 && !WALKABLE.test(p.part) && SIZES[p.part]).map((p) => footprint(p, SIZES[p.part])),
];

/** Walkability of the office for an avatar's disc; client prediction and server authority share it. */
export const OFFICE_WALK = new WalkMap(OBSTACLES, WORLD);
export const isWalkable = (x: number, z: number) => OFFICE_WALK.isWalkable(x, z);
/** Grid A* route from `from` to `to` (both included); [] when the target is blocked or unreachable. */
export const findPath = (from: Point, to: Point, map: WalkMap = OFFICE_WALK) => map.findPath(from, to);

/** The named zone containing (x, z), or null for open floor. */
export function zoneAt(x: number, z: number): Zone | null {
  return ZONES.find((zone) => x >= zone.x && x <= zone.x + zone.w && z >= zone.z && z <= zone.z + zone.d) ?? null;
}

/** A zone's name for people ("Acme room"); the id only for a zone the layout does not have. */
export function zoneDisplayName(zoneId: string): string {
  return ZONES.find((zone) => zone.id === zoneId)?.name ?? zoneId;
}

/** Measured size of a built part, (w, d, h) in metres. */
export const partSize = (id: string): [number, number, number] | undefined => SIZES[id];

/** Reference crops prepared as sprites (blender-asset-pipeline/run.py catalog): image url, pixel
 * size and printed size, by catalogue id. */
export const SPRITE_IMAGES = z.object({
  schemaVersion: z.literal(1),
  sprites: z.record(z.string(), z.object({
    url: z.string().startsWith("/assets/sprites/"),
    px: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    dimsMm: z.object({ w: z.number().nullable(), d: z.number().nullable(), h: z.number().nullable() }).nullable(),
  }).strict()),
}).parse(spriteManifest).sprites;
