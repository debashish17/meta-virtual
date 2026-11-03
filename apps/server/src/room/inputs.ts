import type { StepInput } from "@office/shared";

/** A movement input as received: what to do, and the client tick (`seq`) it was predicted on. */
export type QueuedInput = { input: StepInput; seq: number };

/** What one tick does with a player's movement (see `InputQueue.next`). */
export type TickMove<S = unknown> =
  /**
   * Step this input; `lastSeq` becomes its seq. With `restore`, first put the player back to
   * that state: the held-key steps taken since were never taken by the client.
   */
  | { kind: "apply"; input: StepInput; seq: number; restore?: S }
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
 * exactly where the client predicted it. When it arrives with other keys (a release, Shift, a
 * click) the client never took the borrowed steps, so they are undone first (`restore`, the
 * state passed to `next` before the first of them). Never more than one step a tick, so a
 * client sending faster than the tick gains no speed; past `MAX_QUEUED_INPUTS` the oldest
 * inputs are dropped.
 */
export class InputQueue<S = unknown> {
  private items: QueuedInput[] = [];
  private held: Intent | null = null;
  /** The state before each borrowed step not yet paid for by its late input, oldest first. */
  private borrowed: (S | undefined)[] = [];

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
    this.borrowed = [];
  }

  /** Hand over the newest queued input and empty the queue (movement during an activity). */
  takeLatest(): QueuedInput | null {
    const latest = this.items.at(-1) ?? null;
    this.items = [];
    return latest;
  }

  /** Decide this tick's movement; `now` is the player's state before it (kept for `restore`). */
  next(now?: S): TickMove<S> {
    const item = this.items.shift();
    if (item) {
      if (this.borrowed.length > 0 && this.held && sameKeys(this.held, item.input)) {
        this.borrowed.shift();
        return { kind: "ack", seq: item.seq };
      }
      const restore = this.borrowed[0];
      this.borrowed = [];
      this.held = movingIntent(item.input);
      return restore === undefined
        ? { kind: "apply", input: item.input, seq: item.seq }
        : { kind: "apply", input: item.input, seq: item.seq, restore };
    }
    if (this.held) {
      if (this.borrowed.length < MAX_BORROWED_STEPS) this.borrowed.push(now);
      return { kind: "hold", input: this.held };
    }
    return { kind: "idle" };
  }
}
