import { describe, expect, it } from "vitest";
import { PoseSchema } from "./pose.js";

describe("poses", () => {
  it("accepts every pose the office plays", () => {
    for (const pose of ["stand", "walk", "jog", "talk", "phone", "interact", "sit_down",
      "seated", "stand_up", "sit_talk", "type"]) {
      expect(PoseSchema.safeParse(pose).success, pose).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(PoseSchema.safeParse("dance").success).toBe(false);
    expect(PoseSchema.safeParse("idle").success).toBe(false);
    expect(PoseSchema.safeParse("").success).toBe(false);
  });
});
