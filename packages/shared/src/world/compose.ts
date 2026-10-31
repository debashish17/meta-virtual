import { LAYOUTS } from "../layouts/data.js";
import type { LayoutPart, QuarterTurn } from "../layouts/schema.js";
import type { Obstacle, SpriteProp, Wall } from "./schema.js";

/** Helpers that place layouts, parts and props into world coordinates. */

const mm = (v: number) => Math.round(v * 1000) / 1000;

/** Rotate a layout-space offset by a quarter turn (three.js rotation.y, counter-clockwise from above). */
function turn(x: number, z: number, rotY: QuarterTurn): [number, number] {
  switch (rotY) {
    case 90: return [z, -x];
    case 180: return [-x, -z];
    case 270: return [-z, x];
    default: return [x, z];
  }
}

/** A board composite placed with its footprint centre at (x, z). `omit` drops parts by id, for
 * example the layout's own glass walls when the world already has them. */
export function placeLayout(id: string, x: number, z: number, rotY: QuarterTurn = 0,
  omit: (part: string) => boolean = () => false): LayoutPart[] {
  const layout = LAYOUTS.find((l) => l.id === id);
  if (!layout) throw new Error(`no layout ${id}`);
  return layout.parts.filter((p) => !omit(p.part)).map((p) => {
    const [dx, dz] = turn(p.x, p.z, rotY);
    return { part: p.part, x: mm(x + dx), z: mm(z + dz), y: p.y, rotY: ((p.rotY + rotY) % 360) as QuarterTurn };
  });
}

export const part = (id: string, x: number, z: number, rotY: QuarterTurn = 0, y = 0): LayoutPart =>
  ({ part: id, x: mm(x), z: mm(z), y: mm(y), rotY });

export const sprite = (ref: string, x: number, z: number, width: number, y = 0,
  facing: SpriteProp["facing"] = "south"): SpriteProp => ({ ref, x: mm(x), z: mm(z), y: mm(y), width: mm(width), facing });

/** Picture-plane width of a w x d footprint seen from the isometric camera (azimuth 45 degrees). */
export const isoWidth = (w: number, d: number) => (w + d) / Math.SQRT2;

/** The solid pieces of a wall run: the full length minus its door gaps. */
export function wallPieces(wall: Wall): Obstacle[] {
  const horizontal = wall.from[1] === wall.to[1];
  const a = horizontal ? Math.min(wall.from[0], wall.to[0]) : Math.min(wall.from[1], wall.to[1]);
  const b = horizontal ? Math.max(wall.from[0], wall.to[0]) : Math.max(wall.from[1], wall.to[1]);
  const across = horizontal ? wall.from[1] : wall.from[0];
  const gaps = [...wall.doors].sort((p, q) => p.at - q.at).map((door) => [a + door.at, a + door.at + door.width]);
  const pieces: Obstacle[] = [];
  let start = a;
  for (const [g0, g1] of [...gaps, [b, b]]) {
    if (g0 - start > 1e-6) {
      const id = `${wall.id}:${pieces.length}`;
      pieces.push(horizontal
        ? { id, x: start, z: across - wall.thickness / 2, w: g0 - start, d: wall.thickness }
        : { id, x: across - wall.thickness / 2, z: start, w: wall.thickness, d: g0 - start });
    }
    start = g1;
  }
  return pieces;
}

/** Floor rectangle a placed part covers, from its measured size and quarter turn. */
export function footprint(p: LayoutPart, size: [number, number, number]): Obstacle {
  const [w, d] = p.rotY % 180 === 0 ? [size[0], size[1]] : [size[1], size[0]];
  return { id: p.part, x: p.x - w / 2, z: p.z - d / 2, w, d };
}
