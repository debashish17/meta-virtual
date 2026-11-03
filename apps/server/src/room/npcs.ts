import {
  LOOK_PRESETS,
  NPC_PRESET_IDS,
  OFFICE_SPOTS,
  OFFICE_WALK,
  advance,
  homeDeskTarget,
  inTheWay,
  riseOf,
  routineAtDesk,
  routineAway,
  secondsOf,
  type Routine,
  type RoutineWorld,
  type Seat,
} from "@office/shared";
import { NpcState, type OfficeState } from "./schema.js";

/**
 * The shared colleagues (P3-A, decision D6; P6-A runs four at home desks): the kept
 * presets (`NPC_PRESET_IDS`), each at their own home desk in their team (desks.ts), on
 * the routines they have today, run on the server tick with the shared routine code and
 * synced as `NpcView`, the same for everyone in the room. A preset whose person is
 * signed in does not run, as before.
 *
 * The room owns the reservation set (`taken`: desk seat ids and outing spot ids, players
 * and colleagues alike); this director only borrows it. Home desks are held for their
 * owners whether present or not, so spawning never checks them and releasing never frees
 * them; outing spots are held while on the way or there and freed on remove. The room's
 * `activity_start` answers `target_taken` for a colleague's seat.
 *
 * Wiring (office.room.ts, owned by P2-A — see the P3-A report's Requests): one `NpcDirector`
 * per room; `sync(state, taken, playerNames)` after each join and leave, `tick(state, taken,
 * TICK_DT)` on every server tick.
 */

interface NpcEntry {
  seatId: string;
  routine: Routine;
}

// Who starts the day away from their desk: (preset id, spot, seconds before heading back).
const STARTS_AWAY: Record<string, [string, number]> = {
  kenji: ["chat_1", 25],
  sofia: ["chat_2", 25],
};

function clips(): RoutineWorld["clips"] {
  return {
    sit_down: secondsOf("sit_down"),
    stand_up: secondsOf("stand_up"),
    interact: secondsOf("interact"),
  };
}

export class NpcDirector {
  private readonly npcs = new Map<string, NpcEntry>();
  private seed = 20261101;

  private readonly rand = (): number => {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  };

  get size(): number {
    return this.npcs.size;
  }

  /** The desk seat a spawned preset holds, if it is spawned. Test seam. */
  deskOf(presetId: string): string | undefined {
    return this.npcs.get(presetId)?.seatId;
  }

  /** One line per spawned colleague. Test seam. */
  debug(): { id: string; seatId: string; spot: string | null; x: number; z: number }[] {
    return [...this.npcs].map(([id, entry]) => ({
      id,
      seatId: entry.seatId,
      spot: entry.routine.spot,
      x: entry.routine.x,
      z: entry.routine.z,
    }));
  }

  /**
   * Reconcile the spawned colleagues with the signed-in player names: remove every kept
   * preset whose name matches a player (freeing its outing spots, never its home desk),
   * spawn every other kept preset at its home desk. Idempotent.
   */
  sync(state: OfficeState, taken: Set<string>, playerNames: Iterable<string>): void {
    const excluded = new Set(
      [...playerNames].map((name) => name.trim().toLowerCase()),
    );
    const presetById = new Map(LOOK_PRESETS.map((preset) => [preset.id, preset]));
    for (const id of [...this.npcs.keys()]) {
      const preset = presetById.get(id);
      if (preset && excluded.has(preset.name.toLowerCase())) {
        this.release(state, taken, id);
      }
    }
    const kept = LOOK_PRESETS.filter((preset) => NPC_PRESET_IDS.includes(preset.id));
    kept.forEach((preset, index) => {
      if (excluded.has(preset.name.toLowerCase())) return;
      if (this.npcs.has(preset.id)) return;
      const target = homeDeskTarget(preset.id);
      if (!target || target.kind !== "seat") return;
      this.spawn(state, taken, preset.id, target.seat, target.id, index);
    });
  }

  /** Advance every colleague by `dt` and mirror the result into the synced `npcs`. */
  tick(state: OfficeState, taken: Set<string>, dt: number): void {
    const world = this.world(taken);
    for (const [id, entry] of this.npcs) {
      // Everyone else in the way: the players and the other colleagues (ARCHITECTURE 12.1).
      const others: { x: number; z: number }[] = [];
      for (const p of state.players.values()) if (inTheWay(p.pose)) others.push({ x: p.x, z: p.z });
      for (const [otherId, other] of this.npcs) {
        if (otherId !== id && inTheWay(other.routine.pose)) others.push({ x: other.routine.x, z: other.routine.z });
      }
      advance(entry.routine, dt, { ...world, others });
      const npc = state.npcs.get(id);
      if (!npc) continue;
      npc.x = entry.routine.x;
      npc.z = entry.routine.z;
      npc.facing = entry.routine.facing;
      npc.pose = entry.routine.pose;
      npc.speed = entry.routine.speed;
    }
  }

  private world(taken: Set<string>): RoutineWorld {
    return { walk: OFFICE_WALK, spots: OFFICE_SPOTS, taken, rand: this.rand, clips: clips() };
  }

  private spawn(
    state: OfficeState,
    taken: Set<string>,
    presetId: string,
    desk: Seat,
    seatId: string,
    index: number,
  ): void {
    const preset = LOOK_PRESETS.find((candidate) => candidate.id === presetId);
    if (!preset) return;
    // The third colleague chats at their desk instead of typing, as before.
    const seat: Seat = { ...desk, pose: index === 2 ? "sit_talk" : "type" };
    taken.add(seatId);
    const rise = riseOf(preset.look);
    const world = this.world(taken);
    const away = STARTS_AWAY[preset.id];
    const spot = away ? OFFICE_SPOTS.find((candidate) => candidate.id === away[0]) : undefined;
    const routine =
      away && spot && !taken.has(spot.id)
        ? routineAway(seat, spot, away[1], rise, world)
        : routineAtDesk(seat, 6 + index * 9 + this.rand() * 10, rise);
    const npc = new NpcState();
    npc.id = preset.id;
    npc.name = preset.name;
    Object.assign(npc.look, preset.look);
    npc.x = routine.x;
    npc.z = routine.z;
    npc.facing = routine.facing;
    npc.pose = routine.pose;
    npc.speed = routine.speed;
    state.npcs.set(preset.id, npc);
    this.npcs.set(preset.id, { seatId, routine });
  }

  /**
   * Remove a colleague, freeing every outing spot it holds but never its home desk (held
   * for its owner whether present or not). A tea outing holds two spots at once (the
   * counter and the chat spot) while `routine.spot` names only the latest, so the current
   * and queued steps are freed too; reservation ids are exclusive, so each of them can
   * only be this colleague's.
   */
  private release(state: OfficeState, taken: Set<string>, presetId: string): void {
    const entry = this.npcs.get(presetId);
    if (!entry) return;
    const routine = entry.routine;
    if (routine.spot) taken.delete(routine.spot);
    const steps = routine.current ? [routine.current, ...routine.steps] : [...routine.steps];
    for (const step of steps) {
      if (step.kind === "hold" && step.release) taken.delete(step.release);
      if (step.kind === "walk" && step.to) taken.delete(step.to);
    }
    state.npcs.delete(presetId);
    this.npcs.delete(presetId);
  }
}
