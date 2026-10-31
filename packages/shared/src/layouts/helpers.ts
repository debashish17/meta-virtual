import type { LayoutPart, QuarterTurn } from "./schema.js";

/** Builders for layout data. Sizes below are the built parts' measured sizes (builds.generated.json). */

export const DESK_TOP = 0.75;     // workstation desks, credenzas, low storage
export const TABLE_TOP = 0.74;    // meeting, dining and casual tables
export const COUNTER_TOP = 0.9;   // kitchen base cabinets
export const UPPER_CABINET = 1.45;
export const SCREEN_MOUNT = 0.9;  // wall-mounted TVs and boards (bottom edge)

const PANEL = 1.2;                // partition and wall panels are 1.2 m long
const WALL_INSET = 0.05;          // half the thickest panel (solid 0.1 m), so walls stay inside the footprint

const mm = (v: number) => Math.round(v * 1000) / 1000;

export function at(part: string, x: number, z: number, rotY: QuarterTurn = 0, y = 0): LayoutPart {
  return { part, x: mm(x), z: mm(z), y: mm(y), rotY };
}

/** Walls of 1.2 m panels on the edges of a w x d footprint (both multiples of 1.2). Every panel
 * faces into the room except the front row, which faces the viewer; `door` replaces the
 * right-most front panel. */
export function room(w: number, d: number, sides: { back?: string; left?: string; right?: string; front?: string; door?: string }): LayoutPart[] {
  const along = (length: number) => Array.from({ length: Math.round(length / PANEL) }, (_, i) => -length / 2 + PANEL / 2 + i * PANEL);
  const parts: LayoutPart[] = [];
  if (sides.back) parts.push(...along(w).map((x) => at(sides.back!, x, -d / 2 + WALL_INSET)));
  if (sides.left) parts.push(...along(d).map((z) => at(sides.left!, -w / 2 + WALL_INSET, z, 90)));
  if (sides.right) parts.push(...along(d).map((z) => at(sides.right!, w / 2 - WALL_INSET, z, 270)));
  if (sides.front) {
    const xs = along(w);
    xs.forEach((x, i) => parts.push(at(i === xs.length - 1 && sides.door ? sides.door : sides.front!, x, d / 2 - WALL_INSET)));
  }
  return parts;
}

/** The board's meeting rooms: black-framed full-glass walls with a glass door at front right. */
export const glassRoom = (w: number, d: number) =>
  room(w, d, { back: "partition.full-glass-wall", left: "partition.full-glass-wall", right: "partition.full-glass-wall",
    front: "partition.full-glass-wall", door: "partition.glass-wall-with-door" });

/** A plain wall behind wall-run furniture (kitchens, display walls). */
export const backWall = (w: number, d: number) => room(w, d, { back: "partition.solid-wall-panel" });

/** z of something standing against a back wall made by room()/backWall(), given its depth. */
export const againstBack = (d: number, depth: number) => mm(-d / 2 + 2 * WALL_INSET + depth / 2);

/** Chairs around a rectangular table centred at (tx, tz): `along` are x offsets of the chairs on
 * each long side, `ends` adds one at each short end. Chairs face the table. */
export function around(chair: string, tx: number, tz: number, table: { w: number; d: number },
  seats: { along: number[]; ends?: boolean; back?: boolean; front?: boolean }, gap = 0.2): LayoutPart[] {
  const parts: LayoutPart[] = [];
  for (const dx of seats.along) {
    if (seats.back !== false) parts.push(at(chair, tx + dx, tz - table.d / 2 - gap, 0));
    if (seats.front !== false) parts.push(at(chair, tx + dx, tz + table.d / 2 + gap, 180));
  }
  if (seats.ends) parts.push(at(chair, tx - table.w / 2 - gap, tz, 90), at(chair, tx + table.w / 2 + gap, tz, 270));
  return parts;
}

/** One person's place at a 0.7 m deep desk centred at (x, z): chair, monitor at the far edge and an
 * under-desk pedestal. `facing` is the side the person sits on. */
export function place(x: number, z: number, facing: 1 | -1,
  kit: { chair?: string; monitor?: string | null; pedestal?: number | null; plant?: number | null } = {}): LayoutPart[] {
  const rot: QuarterTurn = facing === 1 ? 0 : 180;
  const parts = [at(kit.chair ?? "seating.task-chair-black", x, z + facing * 0.5, facing === 1 ? 180 : 0)];
  if (kit.monitor !== null) parts.push(at(kit.monitor ?? "tech.monitor-single", x, z - facing * 0.22, rot, DESK_TOP));
  if (kit.pedestal != null) parts.push(at("storage.pedestal-drawer", x + kit.pedestal * 0.38, z - facing * 0.05, rot));
  if (kit.plant != null) parts.push(at("greenery.desk-plant-small", x + kit.plant * 0.5, z - facing * 0.2, 0, DESK_TOP));
  return parts;
}

/** A standard desk with its place (see place()). */
export const desk = (x: number, z: number, facing: 1 | -1, kit: Parameters<typeof place>[3] = {}) =>
  [at("workstation.standard-desk", x, z, facing === 1 ? 0 : 180), ...place(x, z, facing, kit)];

/** The L-shaped manager's desk (return at back right), the person facing +z from the inner corner,
 * with a credenza behind them. (x, z) is the desk centre. */
export function executiveDesk(x: number, z: number): LayoutPart[] {
  return [
    at("workstation.l-shape-desk", x, z),
    at("seating.executive-chair", x - 0.3, z - 0.3),
    at("tech.monitor-single", x - 0.3, z + 0.58, 180, DESK_TOP),
    at("lighting.desk-lamp", x + 0.55, z - 0.5, 0, DESK_TOP),
    at("storage.pedestal-drawer", x + 0.5, z - 0.4, 270),
    at("storage.credenza-low", x, z - 1.1),
    at("greenery.desk-plant-broadleaf", x + 0.55, z - 1.1, 0, DESK_TOP),
  ];
}
