/**
 * The LLM seam (ARCHITECTURE.md 12.5). It returns RAW (unvalidated) output; the pipelines
 * validate with Zod, retry once with the validation error, then fall back. P2-D adds
 * `FixtureLlm` and the Meta adapter; this stub keeps the server bootable until then.
 */

export interface MeetingContext {
  zoneId: string;
  accountName?: string;
  projectName?: string;
  /** Phase 6 (P6-B): the booking's agenda, so extraction weighs what the meeting was for. */
  agenda?: string;
}

export interface LlmClient {
  extractMeeting(transcript: string, context: MeetingContext): Promise<unknown>;
  /** `context`: who is asking and what the records are, when the question needs it (my day). */
  answer(question: string, records: unknown[], context?: string): Promise<unknown>;
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
