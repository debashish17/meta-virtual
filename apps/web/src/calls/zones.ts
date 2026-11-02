import { ZONES } from "@office/shared";

/** The zone types a call can start in (ARCHITECTURE.md 12.9). */
const CALLABLE_TYPES = new Set(["meeting_room", "customer_room", "project_room"]);

/** True when the avatar's net-store zone should join its LiveKit room. */
export function isCallableZone(zoneId: string | null): boolean {
  if (!zoneId) return false;
  const zone = ZONES.find((z) => z.id === zoneId);
  return zone !== undefined && CALLABLE_TYPES.has(zone.type);
}

/** The zone's display name, or a generic fallback that never shows an id-shaped hole. */
export function zoneName(zoneId: string | null): string {
  if (!zoneId) return "a meeting room";
  return ZONES.find((z) => z.id === zoneId)?.name ?? zoneId;
}
