import { describe, expect, it } from "vitest";
import {
  ACME_SYNC_TRANSCRIPT,
  ExtractionResult,
  acmeSyncExpected,
} from "@office/shared";
import { FixtureLlm } from "../llm/fixture.js";
import type { LlmClient, MeetingContext } from "../llm/types.js";
import { FALLBACK_NOTICE, processMeeting } from "./pipeline.js";
import { demoSnapshot } from "./testSnapshot.js";

const CONTEXT: MeetingContext = { zoneId: "acme_room" };
const MEETING_ID = "00000000-0000-4000-8000-000000000000";

type ScriptedStep = { value: unknown } | { throw: string };

/**
 * An `LlmClient` that replays scripted extractions and counts calls. It has no feedback
 * method, so the pipeline retries through the plain `extractMeeting` path.
 */
class ScriptedLlm implements LlmClient {
  calls = 0;

  constructor(private readonly steps: ScriptedStep[]) {}

  async extractMeeting(): Promise<unknown> {
    const step = this.steps[Math.min(this.calls, this.steps.length - 1)];
    this.calls += 1;
    if ("throw" in step) {
      throw new Error(step.throw);
    }
    return step.value;
  }

  async answer(): Promise<unknown> {
    return { answer: "", sourceIds: [] };
  }
}

function validExtraction(): unknown {
  return {
    summary: "All good.",
    decisions: [],
    tasks: [],
    commitments: [],
    milestoneChanges: [],
  };
}

describe("processMeeting", () => {
  it("turns the fixture transcript into exactly the four expected changes", async () => {
    const result = await processMeeting({
      llm: new FixtureLlm(),
      transcript: ACME_SYNC_TRANSCRIPT,
      context: CONTEXT,
      snapshot: demoSnapshot(),
      meetingId: MEETING_ID,
    });
    expect(result.fallback).toBe(false);
    expect(result.changes.map((c) => c.type).sort()).toEqual([
      "commitment_update",
      "milestone_date",
      "task_create",
      "task_reassign",
    ]);
    const expected = acmeSyncExpected(MEETING_ID).map((c) => ({ ...c, id: "<id>" }));
    expect(result.changes.map((c) => ({ ...c, id: "<id>" }))).toEqual(expected);
  });

  it("retries once with the validation error, then succeeds", async () => {
    const llm = new ScriptedLlm([{ value: { summary: 42 } }, { value: validExtraction() }]);
    const result = await processMeeting({
      llm,
      transcript: "Maya: short sync",
      context: CONTEXT,
      snapshot: demoSnapshot(),
      meetingId: MEETING_ID,
    });
    expect(llm.calls).toBe(2);
    expect(result.fallback).toBe(false);
    expect(result.extraction.summary).toBe("All good.");
  });

  it("falls back to a summary-only result after two invalid replies", async () => {
    const llm = new ScriptedLlm([{ value: { nope: true } }, { value: "still not json" }]);
    const result = await processMeeting({
      llm,
      transcript: "Maya: this will not parse",
      context: CONTEXT,
      snapshot: demoSnapshot(),
      meetingId: MEETING_ID,
    });
    expect(llm.calls).toBe(2);
    expect(result.fallback).toBe(true);
    expect(result.extraction.summary).toContain(FALLBACK_NOTICE);
    expect(result.extraction.summary).toContain("Maya: this will not parse");
    expect(result.changes).toEqual([]);
  });

  it("falls back when the LLM throws (unavailable)", async () => {
    const llm = new ScriptedLlm([{ throw: "socket hang up" }, { throw: "socket hang up" }]);
    const result = await processMeeting({
      llm,
      transcript: "Maya: anyone there?",
      context: CONTEXT,
      snapshot: demoSnapshot(),
      meetingId: MEETING_ID,
    });
    expect(llm.calls).toBe(2);
    expect(result.fallback).toBe(true);
    expect(result.changes).toEqual([]);
  });

  it("passes the validation error to feedback-capable clients", async () => {
    const seen: string[] = [];
    const llm: LlmClient & {
      extractMeetingWithFeedback(t: string, c: MeetingContext, f: string): Promise<unknown>;
    } = {
      extractMeeting: async () => ({ summary: 42 }),
      extractMeetingWithFeedback: async (_t, _c, feedback) => {
        seen.push(feedback);
        return validExtraction();
      },
      answer: async () => ({ answer: "", sourceIds: [] }),
    };
    const result = await processMeeting({
      llm,
      transcript: "Maya: retry me",
      context: CONTEXT,
      snapshot: demoSnapshot(),
      meetingId: MEETING_ID,
    });
    expect(result.fallback).toBe(false);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("summary");
  });

  it("validates the fallback itself against the shared schema", async () => {
    const llm = new ScriptedLlm([{ value: null }, { value: null }]);
    const result = await processMeeting({
      llm,
      transcript: "",
      context: CONTEXT,
      snapshot: demoSnapshot(),
      meetingId: MEETING_ID,
    });
    expect(result.fallback).toBe(true);
    expect(ExtractionResult.safeParse(result.extraction).success).toBe(true);
  });
});
