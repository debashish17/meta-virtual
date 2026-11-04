import { describe, expect, it } from "vitest";
import { OFFICE_WALK, WORLD, ZONES, findPath, zoneAt } from "./index.js";
import { BOOKABLE_ZONES, ROOM_ENTRY, isBookableZone } from "./rooms.js";

describe("bookable rooms", () => {
  it("books the meeting, customer and project rooms", () => {
    const ids = BOOKABLE_ZONES.map((zone) => zone.id);
    expect(ids).toContain("acme_room");
    expect(ids).toContain("project_room");
    expect(ids).toContain("meeting_a");
    for (const zone of BOOKABLE_ZONES) {
      expect(["meeting_room", "customer_room", "project_room"]).toContain(zone.type);
    }
    for (const zone of ZONES) {
      if (["meeting_room", "customer_room", "project_room"].includes(zone.type)) {
        expect(ids).toContain(zone.id);
      }
    }
  });

  it("has an entry point for every bookable zone and nothing else", () => {
    expect(Object.keys(ROOM_ENTRY).sort()).toEqual(
      BOOKABLE_ZONES.map((zone) => zone.id).sort(),
    );
  });

  it("keeps every entry point walkable, inside its zone and reachable from the spawn", () => {
    for (const zone of BOOKABLE_ZONES) {
      const entry = ROOM_ENTRY[zone.id]!;
      expect(OFFICE_WALK.isWalkable(entry.x, entry.z), `${zone.id} walkable`).toBe(true);
      expect(zoneAt(entry.x, entry.z)?.id, `${zone.id} inside`).toBe(zone.id);
      const path = findPath(WORLD.spawn, entry);
      expect(path.length, `${zone.id} reachable`).toBeGreaterThan(0);
      const last = path[path.length - 1]!;
      expect(Math.hypot(last.x - entry.x, last.z - entry.z), `${zone.id} ends at entry`).toBeLessThan(
        0.5,
      );
    }
  });

  it("answers bookability by zone id", () => {
    expect(isBookableZone("acme_room")).toBe(true);
    expect(isBookableZone("tea_point")).toBe(false);
    expect(isBookableZone("no_such_room")).toBe(false);
  });
});
