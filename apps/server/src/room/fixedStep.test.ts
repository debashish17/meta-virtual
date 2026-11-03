import { describe, expect, it } from "vitest";
import { TICK_DT } from "@office/shared";
import { FixedStep } from "./fixedStep.js";

const STEP_MS = TICK_DT * 1000;

function total(clock: FixedStep, gaps: number[]): { sum: number; most: number } {
  const steps = gaps.map((gap) => clock.advance(gap));
  return { sum: steps.reduce((a, b) => a + b, 0), most: Math.max(...steps) };
}

describe("FixedStep", () => {
  it("runs TICK_HZ steps a second when the timer only fires on Windows' 15.625 ms grid", () => {
    // A fine poll lands on the coarse Windows timer grid: 64 polls are one second.
    const { sum, most } = total(new FixedStep(STEP_MS), Array<number>(64).fill(15.625));
    expect(sum).toBe(20);
    expect(most).toBe(1); // one step per poll, so every step gets its own patch
  });

  it("keeps the average when the timer fires late (a 50 ms interval fires every 62.5 ms)", () => {
    const { sum } = total(new FixedStep(STEP_MS), Array<number>(16).fill(62.5));
    expect(sum).toBe(20);
  });

  it("drops the backlog after a long stall instead of spiralling", () => {
    const clock = new FixedStep(STEP_MS, 5);
    expect(clock.advance(2000)).toBe(5);
    expect(clock.advance(10)).toBe(0);
    expect(clock.advance(40)).toBe(1);
  });

  it("ignores zero, negative and invalid gaps", () => {
    const clock = new FixedStep(STEP_MS);
    expect(clock.advance(0)).toBe(0);
    expect(clock.advance(-30)).toBe(0);
    expect(clock.advance(Number.NaN)).toBe(0);
    expect(clock.advance(STEP_MS)).toBe(1);
  });
});
