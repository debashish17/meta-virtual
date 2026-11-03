import type { StepInput } from "@office/shared";

/** A movement input as received: what to do, and the client tick (`seq`) it was predicted on. */
export type QueuedInput = { input: StepInput; seq: number };

/** What one tick does with a player's movement (see `InputQueue.next`). */
export type TickMove =
  /** Step this input; `lastSeq` becomes its seq. */
  | { kind: "apply"; input: StepInput; seq: number }
  /** This input's step was already taken while it was late: no step; `lastSeq` becomes its seq. */
  | { kind: "ack"; seq: number }
  /** Nothing queued: walk on with the held keys. */
  | { kind: "hold"; input: StepInput }
  /** Nothing queued or held: follow the route, if any. */
  | { kind: "idle" };

/** Newest inputs kept per player; older ones are dropped (at 20 Hz, 200 ms of backlog). */
export const MAX_QUEUED_INPUTS = 4;
/** Held-key steps counted against late inputs; longer silences walk on uncounted. */
export const MAX_BORROWED_STEPS = 2;

type Intent = Extract<StepInput, { kind: "intent" }>;

function movingIntent(input: StepInput): Intent | null {
  return input.kind === "intent" && (input.dx !== 0 || input.dz !== 0) ? input : null;
}

function sameKeys(held: Intent, input: StepInput): boolean {
  return (
    input.kind === "intent" && input.dx === held.dx && input.dz === held.dz && input.run === held.run
  );
}

/**
 * One player's movement inputs between ticks (ARCHITECTURE.md 12.1).
 *
 * The client predicts exactly one fixed step per input it sends, so the room applies exactly
 * one queued input per tick, in order. Keeping only the newest input of a tick (as the room
 * did before) lost a step whenever two inputs landed between ticks, which on a jittery timer is
 * all the time, and the avatar was corrected backwards.
 *
 * While nothing is queued (an input is late, or the client stopped sending) the held keys are
 * re-applied, as before. Those steps are counted as borrowed: when the late input arrives with
 * the same keys it is acknowledged without a second step, so the position at `lastSeq` stays
 * exactly where the client predicted it. Never more than one step a tick, so a client sending
 * faster than the tick gains no speed; past `MAX_QUEUED_INPUTS` the oldest inputs are dropped.
 */
export class InputQueue {
  private items: QueuedInput[] = [];
  private held: Intent | null = null;
  private borrowed = 0;

  get length(): number {
    return this.items.length;
  }

  push(item: QueuedInput): void {
    this.items.push(item);
    while (this.items.length > MAX_QUEUED_INPUTS) this.items.shift();
  }

  /** Forget queued inputs, held keys and borrowed steps (an activity starts, a teleport). */
  clear(): void {
    this.items = [];
    this.held = null;
    this.borrowed = 0;
  }

  /** Hand over the newest queued input and empty the queue (movement during an activity). */
  takeLatest(): QueuedInput | null {
    const latest = this.items.at(-1) ?? null;
    this.items = [];
    return latest;
  }

  /** Decide this tick's movement. */
  next(): TickMove {
    const item = this.items.shift();
    if (item) {
      if (this.borrowed > 0 && this.held && sameKeys(this.held, item.input)) {
        this.borrowed -= 1;
        return { kind: "ack", seq: item.seq };
      }
      this.borrowed = 0;
      this.held = movingIntent(item.input);
      return { kind: "apply", input: item.input, seq: item.seq };
    }
    if (this.held) {
      if (this.borrowed < MAX_BORROWED_STEPS) this.borrowed += 1;
      return { kind: "hold", input: this.held };
    }
    return { kind: "idle" };
  }
}
