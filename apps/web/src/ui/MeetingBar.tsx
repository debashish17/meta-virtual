import { useState } from "react";
import { useOfficeUi } from "../office/state.js";
import { processAcmeMeeting } from "./actions.js";

/**
 * "Process meeting", shown only while the avatar is in the Acme room (the zone comes
 * from `useOfficeUi`). Processes the fixture transcript; the approval drawer then shows
 * the meeting summary and the proposed changes. Disabled while its request is pending.
 */
export default function MeetingBar() {
  const zone = useOfficeUi((s) => s.zone);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (zone?.id !== "acme_room") return null;

  async function run() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await processAcmeMeeting();
    } catch (err) {
      setError(err instanceof Error ? err.message : "processing failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="pan-meeting">
      <button type="button" className="pan-btn pan-btn-primary" disabled={pending} onClick={() => void run()}>
        {pending ? "Processing…" : "Process meeting"}
      </button>
      {error && (
        <p className="pan-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
