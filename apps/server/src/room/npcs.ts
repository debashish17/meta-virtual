import {
  DESK_SEATS,
  LOOK_PRESETS,
  OFFICE_SPOTS,
  OFFICE_WALK,
  advance,
  inTheWay,
  riseOf,
  routineAtDesk,
  routineAway,
  secondsOf,
  zoneAt,
  type Routine,
  type RoutineWorld,
  type Seat,
} from "@office/shared";
import { NpcState, type OfficeState } from "./schema.js";

/**
 * The shared colleagues (P3-A, decision D6): the look presets that match no signed-in player,
 * run on the server tick with the shared routine code and synced as `NpcView`, the same for
 * everyone in the room.
 *
 * The room owns the reservation set (`taken`: desk seat ids and outing spot ids, players and
 * colleagues alike); this director only borrows it. A colleague's desk is reserved at spawn,
 * outing spots while on the way or there (routine.ts), everything freed on remove — so the
 * room's `activity_start` answers `target_taken` for a colleague's seat, and `sync` never
 * spawns onto a seat a player holds.
 *
 * Wiring (office.room.ts, owned by P2-A — see the P3-A report's Requests): one `NpcDirector`
 * per room; `sync(state, taken, playerNames)` after each join and leave, `tick(state, taken,
 * TICK_DT)` on every server tick.
 */

type Desk = Seat & { id: string };

interface NpcEntry {
  seatId: string;
  routine: Routine;
}

// Who starts the day away from their desk: (preset id, spot, seconds before heading back).
// Same as the web's offline colleagues, so the office looks the same online.
const STARTS_AWAY: Record<string, [string, number]> = {
  kenji: ["chat_1", 25],
  sofia: ["chat_2", 25],
  ben: ["window_1", 18],
};

function clips(): RoutineWorld["clips"] {
  return {
    sit_down: secondsOf("sit_down"),
    stand_up: secondsOf("stand_up"),
    interact: secondsOf("interact"),
  };
}

/**
 * Desk chairs in the team areas, spread across the teams and rows in the same order as the
 * web's offline colleagues (Colleagues.tsx), then any chairs the spread rounds never reach.
 * Deterministic, so desks are stable across restarts for the same signed-in names.
 */
function spreadDesks(): Desk[] {
  const byTeam = new Map<string, Desk[]>();
  for (const seat of DESK_SEATS) {
    const team = zoneAt(seat.x, seat.z)?.id ?? "";
    byTeam.set(team, [...(byTeam.get(team) ?? []), seat]);
  }
  const order: Desk[] = [];
  const seen = new Set<string>();
  const deal = (chair: Desk): void => {
    if (!seen.has(chair.id)) {
      seen.add(chair.id);
      order.push(chair);
    }
  };
  for (let round = 0; round < 6; round += 1) {
    for (const list of byTeam.values()) {
      const step = Math.floor(list.length / 3);
      deal(list[(round * step + round * 5 + 3) % list.length]);
    }
  }
  for (const seat of DESK_SEATS) deal(seat);
  return order;
}

export class NpcDirector {
  private readonly npcs = new Map<string, NpcEntry>();
  private readonly desks = spreadDesks();
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
   * Reconcile the spawned colleagues with the signed-in player names: remove every preset
   * whose name matches a player (freeing its desk and outing spots), spawn every other
   * preset that is not spawned yet. Idempotent.
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
    let spawnIndex = this.npcs.size;
    for (const preset of LOOK_PRESETS) {
      if (excluded.has(preset.name.toLowerCase())) continue;
      if (this.npcs.has(preset.id)) continue;
      const held = new Set([...this.npcs.values()].map((entry) => entry.seatId));
      const desk = this.desks.find((chair) => !taken.has(chair.id) && !held.has(chair.id));
      if (!desk) continue; // No free desk: skip rather than share a seat.
      this.spawn(state, taken, preset.id, desk, spawnIndex);
      spawnIndex += 1;
    }
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
    desk: Desk,
    index: number,
  ): void {
    const preset = LOOK_PRESETS.find((candidate) => candidate.id === presetId);
    if (!preset) return;
    // The third colleague chats at their desk instead of typing, as offline.
    const seat: Seat = { ...desk, pose: index === 2 ? "sit_talk" : "type" };
    taken.add(desk.id);
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
    this.npcs.set(preset.id, { seatId: desk.id, routine });
  }

  /**
   * Remove a colleague, freeing its desk and every outing spot it holds. A tea outing holds
   * two spots at once (the counter and the chat spot) while `routine.spot` names only the
   * latest, so the current and queued steps are freed too; reservation ids are exclusive, so
   * each of them can only be this colleague's.
   */
  private release(state: OfficeState, taken: Set<string>, presetId: string): void {
    const entry = this.npcs.get(presetId);
    if (!entry) return;
    taken.delete(entry.seatId);
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
