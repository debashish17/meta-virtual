import { DESK_SEATS, seatKey, type Target } from "./activity.js";
import { DEMO_PEOPLE } from "../demo/index.js";
import { zoneAt } from "../world/index.js";
import { LOOK_PRESETS } from "./look.js";

/**
 * Home desks (ARCHITECTURE.md 12.10): every kept person sits at their own desk in their
 * team's area. A desk is named by its team and its index in that team's layout order
 * (`team_success#3`), never by coordinates, so assignments survive a new floor plan; it
 * resolves at load time to today's `seat:x,z` id, so `activity_start` and the reservation
 * set keep their wire format.
 */

/** Person key (a demo key or a kept preset id) to desk name. Maya sits with Customer
 * success, Arjun with Integrations; the four running colleagues spread over the four teams. */
export const HOME_DESKS: Readonly<Record<string, string>> = {
  maya: "team_success#0",
  arjun: "team_integrations#0",
  lena: "team_product#0",
  omar: "team_platform#0",
  sofia: "team_success#1",
  kenji: "team_integrations#1",
};

/** The colleague presets that run, at their home desks (decision D12: four). A preset whose
 * person is signed in does not run, as before. */
export const NPC_PRESET_IDS: readonly string[] = ["lena", "omar", "sofia", "kenji"];
export const NPC_COUNT = NPC_PRESET_IDS.length;

/** The team a person key belongs to, from their home desk (`null` when they have none). */
export function teamOf(personKey: string): string | null {
  const name = HOME_DESKS[personKey];
  if (!name) return null;
  const hash = name.indexOf("#");
  return hash < 0 ? null : name.slice(0, hash);
}

/** Match a signed-in display name to a person key (case-insensitive, against `DEMO_PEOPLE`
 * and the look presets, the way the colleagues skip a signed-in person). */
export function personKeyForDisplayName(displayName: string): string | null {
  const want = displayName.trim().toLowerCase();
  if (!want) return null;
  for (const person of DEMO_PEOPLE) {
    if (person.name.toLowerCase() === want) return person.key;
  }
  for (const preset of LOOK_PRESETS) {
    if (preset.name.toLowerCase() === want) return preset.id;
  }
  return null;
}

type SeatLike = { x: number; z: number };

const teamIdAt = (seat: SeatLike): string | null => zoneAt(seat.x, seat.z)?.id ?? null;

/** A team's desks in layout order (the order the chairs appear in the shared layout). */
export function desksByTeam(
  teamId: string,
  seats: readonly SeatLike[] = DESK_SEATS,
  teamIdOf: (seat: SeatLike) => string | null = teamIdAt,
): readonly SeatLike[] {
  return seats.filter((seat) => teamIdOf(seat) === teamId);
}

/** Resolve a desk name (`team#index`) to today's `seat:x,z` id, or `null` when the team or
 * index does not exist. Resolution is by index only, so a new floor plan keeps the names. */
export function resolveDeskId(
  name: string,
  seats: readonly SeatLike[] = DESK_SEATS,
  teamIdOf: (seat: SeatLike) => string | null = teamIdAt,
): string | null {
  const hash = name.indexOf("#");
  if (hash < 0) return null;
  const team = name.slice(0, hash);
  const index = Number(name.slice(hash + 1));
  if (!Number.isInteger(index) || index < 0) return null;
  const seat = desksByTeam(team, seats, teamIdOf)[index];
  return seat ? seatKey(seat) : null;
}

/** Today's `seat:x,z` id of a person's home desk, or `null` when they have none. */
export function homeDeskSeatId(personKey: string): string | null {
  const name = HOME_DESKS[personKey];
  return name ? resolveDeskId(name) : null;
}

/** Every home desk's seat id (the room holds them in `OfficeState.taken`, present or not). */
export function homeDeskSeatIds(): readonly string[] {
  return Object.keys(HOME_DESKS)
    .map(homeDeskSeatId)
    .filter((id): id is string => id !== null);
}

/** True when a reservation id is someone's home desk (never freed while anyone is away). */
export function isHomeDeskSeat(id: string): boolean {
  return homeDeskSeatIds().includes(id);
}

/** A person's home desk as an activity target (walk to, sit, type), or `null`. */
export function homeDeskTarget(personKey: string): Target | null {
  const id = homeDeskSeatId(personKey);
  if (!id) return null;
  const seat = DESK_SEATS.find((s) => s.id === id);
  return seat ? { kind: "seat", id: seat.id, seat } : null;
}
