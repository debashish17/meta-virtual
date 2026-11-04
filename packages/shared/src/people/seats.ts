import type { LayoutPart } from "../layouts/index.js";
import { FURNITURE, OFFICE_WALK, WORLD, findPath, zoneAt, type Point } from "../world/index.js";
import { seatFor, type Seat } from "./routine.js";

/**
 * Free seating (ARCHITECTURE.md 12.10, P6-D): lounge armchairs, sofas, café chairs and
 * meeting-room chairs as `sit_talk` seats, open to anyone. Each keeps the `seat:x,z` wire
 * format, so `activity_start` and the reservation set treat them like desk seats; home
 * desks (desks.ts) are desk seats only and never appear here. A seat type whose sit-down
 * looks wrong in a screenshot is left out of the lists below rather than hacked.
 */

/** `seat:x,z`, the id of a seat on the wire and in reservation sets. */
export const seatKey = (p: Point) => `seat:${p.x.toFixed(2)},${p.z.toFixed(2)}`;

export type FreeSeat = Seat & { id: string; part: string };

/** One seat per placed part, at the part's middle. */
const SINGLE_SEAT_PARTS: readonly string[] = [
  // lounge armchairs (open-lounge and sofa-plus-chair sets, the window lounge)
  "lounge.lounge-chair-fabric",
  "lounge.lounge-chair-leather",
  // café and break-out chairs (dining tables, casual-meeting sets)
  "lounge.accent-chair-light",
  "seating.visitor-chair",
  // meeting-room chairs (conference rooms, the boardroom, huddles)
  "seating.conference-chair",
  "seating.executive-chair",
  // No bar stools: the sit-down is authored for chair height, so a sitter sinks
  // through a 0.76 m stool (screenshot p6d-seat-bar-stool-*.png). Left out
  // rather than hacked, per the package's rule.
];

/** Sofas: one seat per cushion, offset across the sofa's width (metres from its middle). */
const SOFA_SEAT_OFFSETS: Readonly<Record<string, readonly number[]>> = {
  "lounge.sofa-2-seater": [-0.4, 0.4],
  "lounge.3-seater-sofa": [-0.7, 0, 0.7],
  "lounge.high-back-sofa": [-0.4, 0.4],
};

/** Task chairs are desk seats in the team areas (activity.ts) and free seats elsewhere. */
const TASK_CHAIRS: ReadonlySet<string> = new Set([
  "seating.task-chair-black",
  "seating.task-chair-grey",
]);

const isTeamDesk = (p: LayoutPart): boolean =>
  p.part === "seating.task-chair-black" && (zoneAt(p.x, p.z)?.id.startsWith("team_") ?? false);

function sofaSeats(part: LayoutPart, offsets: readonly number[]): FreeSeat[] {
  const base = seatFor(part, "sit_talk", OFFICE_WALK);
  const rad = (part.rotY * Math.PI) / 180;
  const right = { x: Math.cos(rad), z: -Math.sin(rad) }; // the sofa's local +x in world axes
  return offsets.map((off) => {
    const at = { x: part.x + right.x * off, z: part.z + right.z * off };
    return { ...base, x: at.x, z: at.z, id: seatKey(at), part: part.part };
  });
}

function freeSeatAt(part: LayoutPart): FreeSeat[] {
  if (isTeamDesk(part)) return [];
  const offsets = SOFA_SEAT_OFFSETS[part.part];
  if (offsets) return sofaSeats(part, offsets);
  if (SINGLE_SEAT_PARTS.includes(part.part) || TASK_CHAIRS.has(part.part)) {
    return [{ ...seatFor(part, "sit_talk", OFFICE_WALK), id: seatKey(part), part: part.part }];
  }
  return [];
}

/**
 * A seat is only offered when someone can actually sit down on it: the approach behind the
 * chair must be open floor in the same zone (never through a wall) and reachable on foot.
 * Today that leaves out two huddle chairs facing the south wall, two tight town-hall rows,
 * two window-corner sofa cushions and one huddle end chair whose approach is outside the room.
 */
function approachable(seat: Seat): boolean {
  if (!OFFICE_WALK.isWalkable(seat.aisle.x, seat.aisle.z)) return false;
  const zone = zoneAt(seat.x, seat.z)?.id ?? null;
  if ((zoneAt(seat.aisle.x, seat.aisle.z)?.id ?? null) !== zone) return false;
  return findPath(WORLD.spawn, seat.aisle).length > 0;
}

/** Every free seat in the office, in layout order. */
export const FREE_SEATS: readonly FreeSeat[] = FURNITURE.flatMap(freeSeatAt).filter(approachable);
