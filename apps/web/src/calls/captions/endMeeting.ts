import {
  MeetingCreateTranscript,
  MeetingProcessResult,
  type ProposedChange,
  type RecordKind,
} from "@office/shared";
import type { OfficeApi } from "../../api/types.js";
import { NO_SPEECH_NOTICE, assembleTranscript, type CaptionSegment } from "./assembly.js";

/**
 * "End meeting" and the paste-a-transcript panel (P5-C tasks 2 and 3): both post to
 * `POST /meetings` with the zone, so a captured transcript and pasted text run through
 * the existing extraction pipeline identically. An empty transcript answers with the
 * no-speech notice and creates no meeting.
 */

export interface EndMeetingDeps {
  api: Pick<OfficeApi, "processMeeting">;
  refetch?: (kinds: RecordKind[]) => Promise<void>;
}

export type TranscriptPostResult =
  | { meetingId: string; proposedChanges: ProposedChange[] }
  | { notice: typeof NO_SPEECH_NOTICE };

export async function postTranscriptAsMeeting(
  deps: EndMeetingDeps,
  input: { zoneId: string; transcript: string },
): Promise<TranscriptPostResult> {
  if (input.transcript.trim().length === 0) return { notice: NO_SPEECH_NOTICE };
  const created = MeetingCreateTranscript.parse({ zoneId: input.zoneId, transcript: input.transcript });
  const result = MeetingProcessResult.parse(await deps.api.processMeeting(created));
  await deps.refetch?.(["proposed_changes", "meetings"]);
  return { meetingId: result.meetingId, proposedChanges: result.proposedChanges };
}

/** The paste-a-transcript panel: the no-microphone route, kept for the static demo. */
export async function postPastedTranscript(
  deps: EndMeetingDeps,
  input: { zoneId: string; text: string },
): Promise<TranscriptPostResult> {
  return postTranscriptAsMeeting(deps, { zoneId: input.zoneId, transcript: input.text });
}

/** "End meeting": assemble the call's final segments and post them as the transcript. */
export async function endMeeting(
  deps: EndMeetingDeps,
  input: { zoneId: string; segments: readonly CaptionSegment[] },
): Promise<TranscriptPostResult> {
  return postTranscriptAsMeeting(deps, {
    zoneId: input.zoneId,
    transcript: assembleTranscript(input.segments),
  });
}
