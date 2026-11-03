import { describe, expect, it } from "vitest";
import { OFFICE_WALK, WORLD, zoneAt } from "../world/index.js";
import { DESK_SEATS, seatKey } from "./activity.js";
import {
  HOME_DESKS,
  NPC_COUNT,
  NPC_PRESET_IDS,
  desksByTeam,
  homeDeskSeatId,
  homeDeskSeatIds,
  homeDeskTarget,
  isHomeDeskSeat,
  personKeyForDisplayName,
  resolveDeskId,
  teamOf,
} from "./desks.js";

const SEAT_IDS = new Set(DESK_SEATS.map((s) => s.id));

describe("home desks", () => {
  it("maps Maya and Arjun to desks in their teams", () => {
    expect(teamOf("maya")).toBe("team_success");
    expect(teamOf("arjun")).toBe("team_integrations");
    expect(teamOf("priya")).toBeNull();
  });

  it("resolves every home desk to a real desk seat inside its team's zone", () => {
    for (const [key, name] of Object.entries(HOME_DESKS)) {
      const id = homeDeskSeatId(key);
      expect(id, `${key} (${name}) resolves`).not.toBeNull();
      expect(SEAT_IDS.has(id as string)).toBe(true);
      const seat = DESK_SEATS.find((s) => s.id === id)!;
      expect(zoneAt(seat.x, seat.z)?.id, `${key} sits in its team`).toBe(teamOf(key));
      // Reachable from the entrance, so check-in can always walk there.
      const route = OFFICE_WALK.findPath(WORLD.spawn, seat.aisle);
      expect(route.length, `${key} is reachable`).toBeGreaterThan(0);
    }
  });

  it("gives no two people the same desk", () => {
    const ids = homeDeskSeatIds();
    expect(ids).toHaveLength(Object.keys(HOME_DESKS).length);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(isHomeDeskSeat(id)).toBe(true);
    expect(isHomeDeskSeat("seat:0.00,0.00")).toBe(false);
  });

  it("keeps desk names when the layout's coordinates change (resolve by index)", () => {
    // The same teams in layout order, but on a different floor plan.
    const moved = [
      { x: 101.5, z: 202.25 },
      { x: 103.5, z: 202.25 },
      { x: 301.0, z: 402.0 },
    ];
    const teamIdOf = (seat: { x: number; z: number }) =>
      seat.x < 200 ? "team_success" : "team_x";
    expect(desksByTeam("team_success", moved, teamIdOf)).toHaveLength(2);
    // Same names, new coordinates: the name follows the index, not the point.
    expect(resolveDeskId("team_success#0", moved, teamIdOf)).toBe(seatKey(moved[0]));
    expect(resolveDeskId("team_success#1", moved, teamIdOf)).toBe(seatKey(moved[1]));
    expect(resolveDeskId("team_success#2", moved, teamIdOf)).toBeNull();
    expect(resolveDeskId("team_nowhere#0", moved, teamIdOf)).toBeNull();
    expect(resolveDeskId("not-a-desk", moved, teamIdOf)).toBeNull();
  });

  it("matches signed-in display names to people case-insensitively", () => {
    expect(personKeyForDisplayName("Maya")).toBe("maya");
    expect(personKeyForDisplayName("  maya ")).toBe("maya");
    expect(personKeyForDisplayName("ARJUN")).toBe("arjun");
    expect(personKeyForDisplayName("Sofia")).toBe("sofia");
    expect(personKeyForDisplayName("Zed")).toBeNull();
    expect(personKeyForDisplayName("   ")).toBeNull();
  });

  it("exposes every home desk as an activity target", () => {
    for (const key of Object.keys(HOME_DESKS)) {
      const target = homeDeskTarget(key);
      expect(target?.kind).toBe("seat");
      expect(target?.id).toBe(homeDeskSeatId(key));
    }
    expect(homeDeskTarget("priya")).toBeNull();
  });
});

describe("colleague presets", () => {
  it("runs four presets, each at a home desk in a different team", () => {
    expect(NPC_COUNT).toBe(4);
    expect(NPC_PRESET_IDS).toHaveLength(4);
    const teams = NPC_PRESET_IDS.map(teamOf);
    for (const [i, id] of NPC_PRESET_IDS.entries()) {
      expect(HOME_DESKS[id], `${id} has a home desk`).toMatch(/^team_\w+#\d+$/);
      expect(teams[i]).not.toBeNull();
    }
    expect(new Set(teams).size).toBe(4);
  });
});
