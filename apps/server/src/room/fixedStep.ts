/**
 * Turns measured wall-clock time into a whole number of fixed steps (ARCHITECTURE.md 12.1).
 *
 * The room polls it from a fine timer, so it runs `1000 / stepMs` steps a second on average
 * even where timers are coarse. Windows rounds Node's timers up to its 15.625 ms clock, so a
 * plain 50 ms interval fires every 62.5 ms: the room ran at 16 Hz while clients predicted at
 * 20 Hz, and every local avatar drifted ahead of the server and was snapped back.
 */
export class FixedStep {
  private acc = 0;

  constructor(
    readonly stepMs: number,
    /** Most steps one call returns; after a longer stall the backlog is dropped (no spiral). */
    readonly maxCatchUp = 5,
  ) {}

  /** Add the time since the previous call and return how many steps are due now. */
  advance(elapsedMs: number): number {
    if (!(elapsedMs > 0)) return 0;
    this.acc += elapsedMs;
    const due = Math.floor(this.acc / this.stepMs);
    if (due > this.maxCatchUp) {
      this.acc = 0;
      return this.maxCatchUp;
    }
    this.acc -= due * this.stepMs;
    return due;
  }
}
