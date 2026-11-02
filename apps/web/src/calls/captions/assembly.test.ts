import { describe, expect, it } from "vitest";
import { NO_SPEECH_NOTICE, assembleTranscript } from "./assembly.js";

describe("assembleTranscript", () => {
  it("joins final segments as speaker-prefixed lines in arrival order", () => {
    expect(
      assembleTranscript([
        { name: "Maya", text: "go-live moves", ts: 2 },
        { name: "Arjun", text: "i will take it", ts: 1 },
      ]),
    ).toBe("Maya: go-live moves\nArjun: i will take it");
  });

  it("is empty for no segments", () => {
    expect(assembleTranscript([])).toBe("");
  });

  it("names the no-speech notice exactly", () => {
    expect(NO_SPEECH_NOTICE).toBe("no speech was captured");
  });
});
