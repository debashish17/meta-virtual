import { useEffect, useState } from "react";
import { api } from "../api/index.js";
import { useRecords } from "../api/records.js";

/**
 * The booking's agenda (P6-B), above the meeting summary in the approval
 * drawer. Mounted by P6-0 so this package never edits `ApprovalsPanel.tsx`.
 * Renders nothing when the meeting carries no agenda.
 */
export default function MeetingAgenda({ meetingId }: { meetingId: string }) {
  const cached = useRecords((s) => s.meeting);
  const [agenda, setAgenda] = useState<string | null>(
    cached?.id === meetingId ? (cached.agenda ?? null) : null,
  );
  useEffect(() => {
    if (cached?.id === meetingId && cached.agenda) {
      setAgenda(cached.agenda);
      return;
    }
    let live = true;
    api
      .meeting(meetingId)
      .then((meeting) => {
        if (live && meeting.id === meetingId) {
          setAgenda(meeting.agenda ?? null);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [meetingId, cached]);
  if (!agenda) {
    return null;
  }
  return (
    <section className="pan-meeting-agenda" aria-label="Meeting agenda">
      <h3>Agenda</h3>
      <p>{agenda}</p>
    </section>
  );
}
