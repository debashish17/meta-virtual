/** A final caption segment kept for the end-of-meeting transcript. */
export interface CaptionSegment {
  name: string;
  text: string;
  ts: number;
}

/**
 * Shown when a meeting ends with nothing captured (and returned instead of creating a
 * meeting). Mirrors the server's `NO_SPEECH_NOTICE` in `transcript.ts`; the shared
 * contract is locked, so the string is quoted here and asserted equal in spirit by the
 * e2e spec, which checks the exact words.
 */
export const NO_SPEECH_NOTICE = "no speech was captured";

/** Final segments in arrival order, one `Name: text` line each. */
export function assembleTranscript(segments: readonly CaptionSegment[]): string {
  return segments.map((segment) => `${segment.name}: ${segment.text}`).join("\n");
}
