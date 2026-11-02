import { describe, expect, it } from "vitest";
import {
  DESK_SEATS,
  LOOK_PRESETS,
  NpcView,
  OFFICE_SPOTS,
  TICK_DT,
} from "@office/shared";
import { NpcDirector } from "./npcs.js";
import { OfficeState } from "./schema.js";

const SEAT_IDS = new Set(DESK_SEATS.map((s) => s.id));
const SPOT_IDS = new Set(OFFICE_SPOTS.map((s) => s.id));
const PRESET_NAMES = LOOK_PRESETS.map((p) => p.name);

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
  it("spawns every preset on an empty room, each on a known desk seat", () => {
    const { state, taken, npcs } = setup();
    npcs.sync(state, taken, []);
    expect(state.npcs.size).toBe(LOOK_PRESETS.length);
    expect(npcs.size).toBe(LOOK_PRESETS.length);
    const names = viewsOf(state).map((v) => v.name).sort();
    expect(names).toEqual([...PRESET_NAMES].sort());
    // Every colleague holds a desk seat in the room's reservation set, all different.
    const desks = npcs.debug().map((d) => d.seatId);
    expect(new Set(desks).size).toBe(desks.length);
    for (const id of desks) {
      expect(SEAT_IDS.has(id)).toBe(true);
      expect(taken.has(id)).toBe(true);
    }
  });

  it("does not spawn a preset matching a signed-in player", () => {
    const { state, taken, npcs } = setup();
    npcs.sync(state, taken, ["Maya", "arjun"]);
    expect(state.npcs.size).toBe(LOOK_PRESETS.length - 2);
    const names = viewsOf(state).map((v) => v.name.toLowerCase());
    expect(names).not.toContain("maya");
    expect(names).not.toContain("arjun");
    expect(npcs.debug().map((d) => d.seatId)).toHaveLength(LOOK_PRESETS.length - 2);
    expect(taken.size).toBeGreaterThanOrEqual(LOOK_PRESETS.length - 2);
  });

  it("is idempotent: syncing twice changes nothing", () => {
    const { state, taken, npcs } = setup();
    npcs.sync(state, taken, ["Maya"]);
    const desks = new Map(npcs.debug().map((d) => [d.id, d.seatId] as const));
    const takenBefore = new Set(taken);
    npcs.sync(state, taken, ["Maya"]);
    expect(state.npcs.size).toBe(LOOK_PRESETS.length - 1);
    expect(new Map(npcs.debug().map((d) => [d.id, d.seatId] as const))).toEqual(desks);
    expect(taken).toEqual(takenBefore);
  });

  it("removes the matching colleague when a player joins, freeing its desk", () => {
    const { state, taken, npcs } = setup();
    npcs.sync(state, taken, []);
    const mayaDesk = npcs.deskOf("maya");
    expect(mayaDesk).toBeDefined();
    expect(taken.has(mayaDesk as string)).toBe(true);
    npcs.sync(state, taken, ["Maya"]);
    expect(state.npcs.has("maya")).toBe(false);
    expect(npcs.deskOf("maya")).toBeUndefined();
    expect(taken.has(mayaDesk as string)).toBe(false);
  });

  it("respawns the preset when the player leaves, on a free desk", () => {
    const { state, taken, npcs } = setup();
    npcs.sync(state, taken, ["Maya"]);
    expect(state.npcs.has("maya")).toBe(false);
    npcs.sync(state, taken, []);
    expect(state.npcs.has("maya")).toBe(true);
    const desk = npcs.deskOf("maya") as string;
    expect(SEAT_IDS.has(desk)).toBe(true);
    expect(taken.has(desk)).toBe(true);
    // Still one colleague per desk.
    const desks = npcs.debug().map((d) => d.seatId);
    expect(new Set(desks).size).toBe(desks.length);
  });

  it("never takes a seat a player holds", () => {
    const { state, taken, npcs } = setup();
    // A player holds every desk seat: nobody can spawn.
    for (const id of SEAT_IDS) taken.add(id);
    npcs.sync(state, taken, []);
    expect(state.npcs.size).toBe(0);
    expect(npcs.size).toBe(0);
  });

  it("skips only the seats players hold", () => {
    const { state, taken, npcs } = setup();
    const held = DESK_SEATS[0].id;
    taken.add(held);
    npcs.sync(state, taken, []);
    expect(state.npcs.size).toBe(LOOK_PRESETS.length);
    const desks = npcs.debug().map((d) => d.seatId);
    expect(desks).not.toContain(held);
    expect(new Set(desks).size).toBe(desks.length);
  });

  it("ticks the shared routines and mirrors NpcView into state", () => {
    const { state, taken, npcs } = setup();
    npcs.sync(state, taken, ["Maya", "Arjun"]);
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
    expect(views).toHaveLength(LOOK_PRESETS.length - 2);
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

  it("frees outing spots when the colleague is removed mid-outing", () => {
    const { state, taken, npcs } = setup();
    // Only Kenji: whatever is reserved past his desk belongs to his outing.
    const others = PRESET_NAMES.filter((n) => n.toLowerCase() !== "kenji");
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
    expect(taken.size).toBe(0);
  });
});
