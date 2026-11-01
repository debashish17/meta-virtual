import {
  ACME_SYNC_TRANSCRIPT,
  FIXTURE_TRANSCRIPTS,
  type ExtractionResult,
} from "@office/shared";
import type { LlmClient } from "./types.js";

/** What `answer` produces before P3-B wires in P2-E's `fixtureAnswer`. */
export const FIXTURE_ABSTAIN_MESSAGE = "I don't have a record of that.";

/**
 * Builds the raw `{ answer, sourceIds }` output for a question. P3-B passes P2-E's
 * `fixtureAnswer` here in `deps.ts`; until then the fixture abstains.
 */
export type AnswerFn = (question: string, records: unknown[]) => unknown | Promise<unknown>;

function abstain(): unknown {
  return { answer: FIXTURE_ABSTAIN_MESSAGE, sourceIds: [] };
}

/** The deterministic extraction the `acme-sync` transcript must produce (P2-D task 1). */
function acmeSyncExtraction(): ExtractionResult {
  return {
    summary:
      "Acme sync: go-live moves to 22 Nov, the webhook fix moves to Arjun, Maya notifies Acme.",
    decisions: [
      { text: "Move go-live to 22 November" },
      { text: "Reassign the webhook fix to Arjun" },
      { text: "Maya notifies Acme of the new date" },
    ],
    tasks: [
      {
        title: "Fix webhook signature validation",
        ownerName: "Arjun",
        action: "update",
        matchHint: "Fix webhook signature validation",
      },
      { title: "Notify Acme of new date", ownerName: "Maya", action: "create" },
    ],
    commitments: [{ text: "Go-live by 22 Nov", accountName: "Acme Corp", dueDate: "2026-11-22" }],
    milestoneChanges: [
      {
        projectName: "Acme Payments Integration",
        milestoneName: "Go-live",
        newTargetDate: "2026-11-22",
      },
    ],
  };
}

function summaryOnly(transcript: string): ExtractionResult {
  const firstLine = transcript
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return {
    summary: (firstLine ?? transcript.trim()).slice(0, 200) || "Empty transcript.",
    decisions: [],
    tasks: [],
    commitments: [],
    milestoneChanges: [],
  };
}

/**
 * The deterministic LLM (ARCHITECTURE.md 12.5): the default client, and the only one in
 * tests and CI. It returns raw output like every `LlmClient`; the pipelines validate it.
 */
export class FixtureLlm implements LlmClient {
  private readonly answerFn: AnswerFn;

  constructor(answerFn: AnswerFn = abstain) {
    this.answerFn = answerFn;
  }

  async extractMeeting(transcript: string): Promise<unknown> {
    const text = transcript.trim();
    const fixtures = Object.values(FIXTURE_TRANSCRIPTS) as string[];
    if (text === ACME_SYNC_TRANSCRIPT.trim() || fixtures.some((f) => f.trim() === text)) {
      return acmeSyncExtraction();
    }
    return summaryOnly(transcript);
  }

  async answer(question: string, records: unknown[]): Promise<unknown> {
    return this.answerFn(question, records);
  }
}
