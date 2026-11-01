/**
 * The LLM seam (ARCHITECTURE.md 12.5). It returns RAW (unvalidated) output; the pipelines
 * validate with Zod, retry once with the validation error, then fall back. P2-D adds
 * `FixtureLlm` and the Meta adapter; this stub keeps the server bootable until then.
 */

export interface MeetingContext {
  zoneId: string;
  accountName?: string;
  projectName?: string;
}

export interface LlmClient {
  extractMeeting(transcript: string, context: MeetingContext): Promise<unknown>;
  answer(question: string, records: unknown[]): Promise<unknown>;
}

/** The simplest working implementation: a summary-only extraction and an empty answer. */
export class StubLlm implements LlmClient {
  async extractMeeting(transcript: string): Promise<unknown> {
    return {
      summary: transcript.slice(0, 200),
      decisions: [],
      tasks: [],
      commitments: [],
      milestoneChanges: [],
    };
  }

  async answer(): Promise<unknown> {
    return { answer: "", sourceIds: [] };
  }
}
