import { useState } from "react";
import { api } from "../../api/index.js";
import { useRecords } from "../../api/records.js";
import { endMeeting, postPastedTranscript, type EndMeetingDeps } from "./endMeeting.js";
import { isSpeechRecognitionSupported } from "./recognizer.js";
import { clearCaptions, finalSegments, useCaptions } from "./store.js";
import "./captions.css";

/**
 * The transcript panel (P5-C tasks 2 and 3): the call's live captions, "End meeting"
 * (which posts the assembled transcript to the meetings pipeline), and the
 * paste-a-transcript box — the no-microphone route that stays for the static demo.
 * P5-B mounts this beside the call bar (see report R3); until then it is exported but
 * unmounted, and the fixture demo is untouched.
 */
export interface TranscriptPanelProps {
  zoneId: string;
  zoneName?: string;
  deps?: EndMeetingDeps;
  onMeeting?: (meetingId: string) => void;
}

export default function TranscriptPanel({ zoneId, zoneName, deps, onMeeting }: TranscriptPanelProps) {
  const captions = useCaptions((state) => state.captions);
  const [paste, setPaste] = useState("");
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const live: EndMeetingDeps = deps ?? {
    api,
    refetch: (kinds) => useRecords.getState().refetch(kinds),
  };

  async function run(kind: "end" | "paste"): Promise<void> {
    if (pending) return;
    setPending(true);
    setOutcome(null);
    try {
      const result =
        kind === "end"
          ? await endMeeting(live, { zoneId, segments: finalSegments() })
          : await postPastedTranscript(live, { zoneId, text: paste });
      if ("notice" in result) {
        setOutcome(result.notice);
        return;
      }
      const count = result.proposedChanges.length;
      setOutcome(
        `Meeting created with ${count} proposed change${count === 1 ? "" : "s"}.`,
      );
      if (kind === "end") {
        clearCaptions();
      } else {
        setPaste("");
      }
      onMeeting?.(result.meetingId);
    } catch (err) {
      setOutcome(err instanceof Error ? err.message : "posting the transcript failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="cap-panel" aria-label="Meeting transcript">
      <h3 className="cap-title">Meeting transcript{zoneName ? ` — ${zoneName}` : ""}</h3>
      <div className="cap-live" role="log" aria-label="Live captions" aria-live="polite">
        {captions.length === 0 ? (
          <p className="cap-empty">No captions yet.</p>
        ) : (
          <ol className="cap-list">
            {captions.map((caption, index) => (
              <li
                // `ts` repeats across speakers and retries; the index keeps keys unique.
                key={`${caption.ts}-${index}`}
                className={caption.final ? "cap-line" : "cap-line cap-interim"}
              >
                <span className="cap-name">{caption.name}:</span> {caption.text}
              </li>
            ))}
          </ol>
        )}
      </div>
      {!isSpeechRecognitionSupported() && (
        <p className="cap-hint">Live captions need Chrome; pasting a transcript works everywhere.</p>
      )}
      <button
        type="button"
        className="pan-btn pan-btn-primary"
        disabled={pending}
        onClick={() => void run("end")}
      >
        {pending ? "Posting…" : "End meeting"}
      </button>
      <label className="cap-paste-label" htmlFor="cap-paste">
        Paste a transcript
      </label>
      <textarea
        id="cap-paste"
        className="cap-paste"
        value={paste}
        rows={4}
        placeholder="Maya: go-live moves to 22 Nov…"
        onChange={(event) => setPaste(event.target.value)}
      />
      <button
        type="button"
        className="pan-btn"
        disabled={pending || paste.trim().length === 0}
        onClick={() => void run("paste")}
      >
        Create meeting from transcript
      </button>
      {outcome && (
        <p className="cap-outcome" role="status">
          {outcome}
        </p>
      )}
    </section>
  );
}
