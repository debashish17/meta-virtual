import { randomUUID } from "node:crypto";
import { ExtractionResult, type ProposedChange } from "@office/shared";
import type { LlmClient, MeetingContext } from "../llm/types.js";
import { supportsFeedback } from "../llm/meta.js";
import { mapExtractionToChanges, type RecordsSnapshot } from "./map.js";

/** Why the result carries no proposed changes (ARCHITECTURE.md section 10). */
export const FALLBACK_NOTICE = "Could not extract structured changes from this transcript.";

export interface ProcessMeetingInput {
  llm: LlmClient;
  transcript: string;
  context: MeetingContext;
  /** Records the mapping matches against (P3-B reads them from the `Repo`). */
  snapshot: RecordsSnapshot;
  /** Assigned to the changes as `sourceMeetingId`; random when omitted. */
  meetingId?: string;
  nextId?: () => string;
  /**
   * Phase 6 (P6-B): the booking's agenda, from `POST /meetings` with a
   * `bookingId`. It rides on the extraction context (the typed `MeetingContext`
   * gains the field when the lead wires the route); `FixtureLlm` ignores the
   * context, so the fixture output is unchanged.
   */
  agenda?: string;
}

export interface ProcessMeetingResult {
  extraction: ExtractionResult;
  changes: ProposedChange[];
  /** True when validation failed twice (or the LLM threw twice) and the summary-only fallback ran. */
  fallback: boolean;
}

type ParseFailure = Extract<ReturnType<typeof ExtractionResult.safeParse>, { success: false }>;

function issuesText(failure: ParseFailure): string {
  return failure.error.issues
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ")
    .slice(0, 1000);
}

function thrownText(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 1000);
  }
  return "the extraction call failed".slice(0, 1000);
}

function fallbackExtraction(transcript: string): ExtractionResult {
  const firstLine = transcript
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const excerpt = (firstLine ?? transcript.trim()).slice(0, 200);
  return {
    summary: excerpt ? `${excerpt} (${FALLBACK_NOTICE})` : `(${FALLBACK_NOTICE})`,
    decisions: [],
    tasks: [],
    commitments: [],
    milestoneChanges: [],
  };
}

async function attempt(
  llm: LlmClient,
  transcript: string,
  context: MeetingContext,
  feedback: string | null,
): Promise<{ value: unknown } | { failure: string }> {
  try {
    if (feedback !== null && supportsFeedback(llm)) {
      return { value: await llm.extractMeetingWithFeedback(transcript, context, feedback) };
    }
    return { value: await llm.extractMeeting(transcript, context) };
  } catch (error) {
    return { failure: thrownText(error) };
  }
}

function mapped(
  extraction: ExtractionResult,
  input: ProcessMeetingInput,
  meetingId: string,
  fallback: boolean,
): ProcessMeetingResult {
  return {
    extraction,
    changes: mapExtractionToChanges(extraction, input.snapshot, {
      zoneId: input.context.zoneId,
      meetingId,
      nextId: input.nextId,
    }),
    fallback,
  };
}

/**
 * The meeting pipeline (ARCHITECTURE.md section 7): extract, validate with Zod, retry
 * once with the validation error, then fall back to a summary-only result; map the
 * extraction to proposed changes. P3-B persists the meeting and the changes.
 */
export async function processMeeting(input: ProcessMeetingInput): Promise<ProcessMeetingResult> {
  const meetingId = input.meetingId ?? randomUUID();
  const context =
    input.agenda === undefined ? input.context : { ...input.context, agenda: input.agenda };

  const first = await attempt(input.llm, input.transcript, context, null);
  let feedback: string | null = null;
  if ("value" in first) {
    const parsed = ExtractionResult.safeParse(first.value);
    if (parsed.success) {
      return mapped(parsed.data, input, meetingId, false);
    }
    feedback = issuesText(parsed);
  } else {
    feedback = first.failure;
  }

  const second = await attempt(input.llm, input.transcript, context, feedback);
  if ("value" in second) {
    const parsed = ExtractionResult.safeParse(second.value);
    if (parsed.success) {
      return mapped(parsed.data, input, meetingId, false);
    }
  }
  return mapped(fallbackExtraction(input.transcript), input, meetingId, true);
}
