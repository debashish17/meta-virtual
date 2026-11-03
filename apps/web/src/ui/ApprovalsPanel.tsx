import { useState } from "react";
import type { ProposedChange } from "@office/shared";
import { api } from "../api/index.js";
import { useRecords } from "../api/records.js";
import MeetingAgenda from "../bookings/MeetingAgenda.js";
import { refetchAfterDecision } from "./actions.js";
import { changeRows, changeTitle } from "./format.js";

function ChangeCard({
  change,
  busy,
  onDecide,
}: {
  change: ProposedChange;
  busy: boolean;
  onDecide: (id: string, decision: "approve" | "reject") => void;
}) {
  return (
    <li className="pan-item pan-change">
      <div className="pan-change-head">
        <p className="pan-item-title">{changeTitle(change.type)}</p>
        {change.needsReview && <span className="pan-review">Needs review</span>}
      </div>
      <dl className="pan-rows">
        {changeRows(change).map((row) => (
          <div key={row.field} className="pan-row">
            <dt>{row.label}</dt>
            <dd>
              {row.before !== undefined ? (
                <>
                  <span className="pan-before">{row.before}</span>
                  <span className="pan-arrow" aria-hidden="true"> → </span>
                </>
              ) : (
                <span className="pan-new" aria-hidden="true">+ </span>
              )}
              <span className="pan-after">{row.after}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className="pan-change-actions">
        <button
          type="button"
          className="pan-btn pan-btn-primary"
          disabled={busy}
          onClick={() => onDecide(change.id, "approve")}
        >
          Approve
        </button>
        <button type="button" className="pan-btn" disabled={busy} onClick={() => onDecide(change.id, "reject")}>
          Reject
        </button>
      </div>
    </li>
  );
}

/**
 * The approval drawer (DESIGN_SPEC 9): it replaces My day while changes are pending.
 * Each card shows before and after, approve and reject; a decision that conflicts (the
 * change is no longer pending) refreshes the list instead of failing silently.
 */
export default function ApprovalsPanel() {
  const pending = useRecords((s) => s.pending);
  const meeting = useRecords((s) => s.meeting);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function decide(id: string, decision: "approve" | "reject") {
    if (busy) return;
    setBusy(id);
    setNotice(null);
    try {
      await api[decision](id);
      await refetchAfterDecision();
    } catch (err) {
      const message = err instanceof Error ? err.message : "request failed";
      if (/no longer pending/.test(message)) {
        await useRecords.getState().refetch(["proposed_changes", "meetings"]).catch(() => undefined);
        setNotice("Already decided — the list was refreshed.");
      } else {
        setNotice(message);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {meeting && (
        <section className="pan-meeting-summary" aria-label="Meeting summary">
          <MeetingAgenda meetingId={meeting.id} />
          <h3>Meeting summary</h3>
          <p>{meeting.summary}</p>
          {meeting.decisions.length > 0 && (
            <ul>
              {meeting.decisions.map((d, i) => (
                <li key={i}>{d.text}</li>
              ))}
            </ul>
          )}
        </section>
      )}
      {notice && (
        <p className="pan-notice" role="status">
          {notice}
        </p>
      )}
      <ul className="pan-list">
        {pending.map((change) => (
          <ChangeCard key={change.id} change={change} busy={busy !== null} onDecide={(id, d) => void decide(id, d)} />
        ))}
      </ul>
    </div>
  );
}
