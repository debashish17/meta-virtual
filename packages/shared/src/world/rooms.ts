import { OFFICE } from "./office.js";
import { World } from "./schema.js";
import type { Point } from "./walk.js";

// Parsed here, not imported from `index.js`: this module is exported from there,
// so importing it back would read `ZONES` before it is initialized.
const ZONES = World.parse(OFFICE).zones;

/**
 * Bookable meeting rooms (ARCHITECTURE.md 12.10, P6-B). Only `meeting_room`,
 * `customer_room` and `project_room` zones can be booked, one open booking per
 * zone. `ROOM_ENTRY` is a walkable point just inside each bookable room's door
 * (the middle of a phone booth, which has no walls): the host walks there on
 * create and invitees on Join. The coordinates are hand-picked; `rooms.test.ts`
 * proves each one walkable, inside its zone and reachable from the spawn, so a
 * layout change fails loudly instead of stranding anyone.
 */

const BOOKABLE_TYPES = new Set(["meeting_room", "customer_room", "project_room"]);

/** Every zone that can be booked, in layout order. */
export const BOOKABLE_ZONES = ZONES.filter((zone) => BOOKABLE_TYPES.has(zone.type));

/** The entry point inside each bookable room, by zone id. */
export const ROOM_ENTRY: Readonly<Record<string, Point>> = {
  meeting_a: { x: 1.6, z: 5.8 },
  pod_1: { x: 9.4, z: 1.5 },
  pod_2: { x: 10.6, z: 1.5 },
  acme_room: { x: 12.6, z: 5.8 },
  project_room: { x: 26.1, z: 5.8 },
  meeting_b: { x: 40.6, z: 5.8 },
  boardroom: { x: 57.1, z: 6.3 },
  focus_1: { x: 2.9, z: 24.55 },
  focus_2: { x: 2.9, z: 27.65 },
  focus_3: { x: 2.9, z: 30.75 },
  huddle_1: { x: 37.4, z: 35.9 },
  huddle_2: { x: 41.0, z: 35.9 },
};

/** True when a zone id names a bookable room. */
export function isBookableZone(zoneId: string): boolean {
  return BOOKABLE_ZONES.some((zone) => zone.id === zoneId);
}
