import { describe, expect, it } from "vitest";
import {
  DESK_SEATS,
  LOOK_PRESETS,
  NPC_COUNT,
  NPC_PRESET_IDS,
  NpcView,
  OFFICE_SPOTS,
  TICK_DT,
  homeDeskSeatId,
} from "@office/shared";
import { NpcDirector } from "./npcs.js";
import { OfficeState } from "./schema.js";

const SEAT_IDS = new Set(DESK_SEATS.map((s) => s.id));
const SPOT_IDS = new Set(OFFICE_SPOTS.map((s) => s.id));
const NPC_NAMES = LOOK_PRESETS.filter((p) => NPC_PRESET_IDS.includes(p.id)).map((p) => p.name);

function setup() {
  return { state: new OfficeState(), taken: new Set<string>(), npcs: new NpcDirector() };
}

/** The synced npcs as plain views, as the client maps them. */
function viewsOf(state: OfficeState) {
  return [...state.npcs.values()].map((n) =>
    NpcView.parse({
      id: n.id,
      name: n.name,
      look: {
        body: n.look.body,
        top: n.look.top,
        accent: n.look.accent,
        bottom: n.look.bottom,
        shoes: n.look.shoes,
        height: n.look.height,
      },
      x: n.x,
      z: n.z,
      facing: n.facing,
      pose: n.pose,
      speed: n.speed,
    }),
  );
}

describe("NpcDirector", () => {
  it("spawns the four kept presets, each at its home desk", () => {
    const { state, taken, npcs } = setup();
    npcs.sync(state, taken, []);
    expect(NPC_COUNT).toBe(4);
    expect(state.npcs.size).toBe(NPC_COUNT);
    expect(npcs.size).toBe(NPC_COUNT);
    const names = viewsOf(state)
      .map((v) => v.name)
      .sort();
    expect(names).toEqual([...NPC_NAMES].sort());
    // Every colleague holds its home desk seat in the room's reservation set.
    for (const id of NPC_PRESET_IDS) {
      expect(npcs.deskOf(id)).toBe(homeDeskSeatId(id));
      expect(taken.has(homeDeskSeatId(id) as string)).toBe(true);
    }
    const desks = npcs.debug().map((d) => d.seatId);
    expect(new Set(desks).size).toBe(desks.length);
    for (const id of desks) expect(SEAT_IDS.has(id)).toBe(true);
  });

  it("does not spawn a kept preset matching a signed-in player", () => {
    const { state, taken, npcs } = setup();
    npcs.sync(state, taken, ["Lena", "kenji"]);
    expect(state.npcs.size).toBe(NPC_COUNT - 2);
    const names = viewsOf(state).map((v) => v.name.toLowerCase());
    expect(names).not.toContain("lena");
    expect(names).not.toContain("kenji");
    // Maya and Arjun are not colleagues: signing in never changes the four.
    npcs.sync(state, taken, ["Lena", "kenji", "Maya", "Arjun"]);
    expect(state.npcs.size).toBe(NPC_COUNT - 2);
    expect(taken.size).toBeGreaterThanOrEqual(NPC_COUNT - 2);
  });

  it("is idempotent: syncing twice changes nothing", () => {
    const { state, taken, npcs } = setup();
    npcs.sync(state, taken, ["Lena"]);
    const desks = new Map(npcs.debug().map((d) => [d.id, d.seatId] as const));
    const takenBefore = new Set(taken);
    npcs.sync(state, taken, ["Lena"]);
    expect(state.npcs.size).toBe(NPC_COUNT - 1);
    expect(new Map(npcs.debug().map((d) => [d.id, d.seatId] as const))).toEqual(desks);
    expect(taken).toEqual(takenBefore);
  });

  it("removes the matching colleague when a player joins, keeping its home desk held", () => {
    const { state, taken, npcs } = setup();
    npcs.sync(state, taken, []);
    const lenaDesk = npcs.deskOf("lena");
    expect(lenaDesk).toBe(homeDeskSeatId("lena"));
    expect(taken.has(lenaDesk as string)).toBe(true);
    npcs.sync(state, taken, ["Lena"]);
    expect(state.npcs.has("lena")).toBe(false);
    expect(npcs.deskOf("lena")).toBeUndefined();
    // Home desks are held for their owners whether present or not.
    expect(taken.has(lenaDesk as string)).toBe(true);
  });

  it("respawns the preset when the player leaves, on the same home desk", () => {
    const { state, taken, npcs } = setup();
    npcs.sync(state, taken, ["Lena"]);
    expect(state.npcs.has("lena")).toBe(false);
    npcs.sync(state, taken, []);
    expect(state.npcs.has("lena")).toBe(true);
    expect(npcs.deskOf("lena")).toBe(homeDeskSeatId("lena"));
    expect(taken.has(homeDeskSeatId("lena") as string)).toBe(true);
    const desks = npcs.debug().map((d) => d.seatId);
    expect(new Set(desks).size).toBe(desks.length);
  });

  it("spawns at home desks no matter which other seats players hold", () => {
    const { state, taken, npcs } = setup();
    // A player holds every seat that is not a home desk: the colleagues still spawn,
    // because the room never lets a player hold a home desk but the owner's.
    for (const id of SEAT_IDS) {
      if (!NPC_PRESET_IDS.some((preset) => homeDeskSeatId(preset) === id)) taken.add(id);
    }
    npcs.sync(state, taken, []);
    expect(state.npcs.size).toBe(NPC_COUNT);
    expect(npcs.size).toBe(NPC_COUNT);
  });

  it("ignores a held seat that is no one's home", () => {
    const { state, taken, npcs } = setup();
    const held = DESK_SEATS.map((s) => s.id).find(
      (id) => !NPC_PRESET_IDS.some((preset) => homeDeskSeatId(preset) === id),
    )!;
    taken.add(held);
    npcs.sync(state, taken, []);
    expect(state.npcs.size).toBe(NPC_COUNT);
    const desks = npcs.debug().map((d) => d.seatId);
    expect(desks).not.toContain(held);
    expect(new Set(desks).size).toBe(desks.length);
  });

  it("ticks the shared routines and mirrors NpcView into state", () => {
    const { state, taken, npcs } = setup();
    npcs.sync(state, taken, ["Lena"]);
    const atSpawn = new Map(npcs.debug().map((d) => [d.id, { x: d.x, z: d.z }]));
    for (let i = 0; i < 100 * 20; i += 1) {
      npcs.tick(state, taken, TICK_DT);
    }
    // Someone went on an outing and came back still valid.
    const moved = npcs.debug().filter((d) => {
      const from = atSpawn.get(d.id) as { x: number; z: number };
      return Math.hypot(d.x - from.x, d.z - from.z) > 0.5;
    });
    expect(moved.length).toBeGreaterThan(0);
    const views = viewsOf(state);
    expect(views).toHaveLength(NPC_COUNT - 1);
    // The reservation set holds only known seats and spots.
    for (const id of taken) {
      expect(SEAT_IDS.has(id) || SPOT_IDS.has(id)).toBe(true);
    }
    // No two colleagues stand on one spot.
    const spots = npcs.debug().map((d) => d.spot).filter((s): s is string => s !== null);
    expect(new Set(spots).size).toBe(spots.length);
    for (const spot of spots) {
      expect(taken.has(spot)).toBe(true);
    }
  });

  it("frees outing spots but keeps the home desk when the colleague is removed", () => {
    const { state, taken, npcs } = setup();
    // Only Kenji: whatever is reserved past his desk belongs to his outing.
    const others = NPC_NAMES.filter((n) => n.toLowerCase() !== "kenji");
    npcs.sync(state, taken, others);
    expect(npcs.size).toBe(1);
    const desk = npcs.deskOf("kenji") as string;
    let sawTwoSpots = false;
    for (let i = 0; i < 300 * 20 && !sawTwoSpots; i += 1) {
      npcs.tick(state, taken, TICK_DT);
      const outing = [...taken].filter((id) => id !== desk);
      if (outing.length >= 2) sawTwoSpots = true;
    }
    expect(sawTwoSpots).toBe(true);
    npcs.sync(state, taken, [...others, "Kenji"]);
    expect(npcs.size).toBe(0);
    expect(state.npcs.size).toBe(0);
    expect(taken).toEqual(new Set([desk]));
  });
});
