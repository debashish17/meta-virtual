import { useEffect, useState } from "react";
import { useRecords } from "../api/records.js";
import NotesPanel from "../notes/NotesPanel.js";
import ApprovalsPanel from "./ApprovalsPanel.js";
import MyDayPanel from "./MyDayPanel.js";

type DrawerTab = "approvals" | "myday" | "notes";

/**
 * The right drawer (DESIGN_SPEC 9): My day, replaced by the approval drawer while
 * changes are pending (with a tab back to My day), plus the P6-0 Notes tab (P6-C).
 * Collapsible.
 */
export default function RightDrawer() {
  const pending = useRecords((s) => s.pending);
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<DrawerTab>("approvals");
  const hasPending = pending.length > 0;
  useEffect(() => {
    if (hasPending) setTab("approvals");
  }, [hasPending]);
  const showApprovals = hasPending && tab === "approvals";
  const showNotes = tab === "notes" && !showApprovals;
  const title = showApprovals ? `Approvals (${pending.length})` : showNotes ? "Notes" : "My day";

  if (!open) {
    return (
      <button
        type="button"
        className="pan-drawer-tab"
        aria-expanded="false"
        aria-label={hasPending ? `Open approvals, ${pending.length} pending` : "Open my day"}
        onClick={() => setOpen(true)}
      >
        {hasPending ? `Approvals (${pending.length})` : "My day"}
      </button>
    );
  }
  return (
    <aside className="pan-drawer" aria-label={showApprovals ? "Approvals" : showNotes ? "Notes" : "My day"}>
      <header className="pan-head">
        <h2>{title}</h2>
        <button type="button" className="pan-collapse" aria-label="Collapse panel" onClick={() => setOpen(false)}>
          ×
        </button>
      </header>
      <div className="pan-tabs" role="tablist" aria-label="Right drawer">
        {hasPending && (
          <button
            type="button"
            role="tab"
            aria-selected={showApprovals}
            className={showApprovals ? "pan-tab on" : "pan-tab"}
            onClick={() => setTab("approvals")}
          >
            Approvals ({pending.length})
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={!showApprovals && !showNotes}
          className={!showApprovals && !showNotes ? "pan-tab on" : "pan-tab"}
          onClick={() => setTab("myday")}
        >
          My day
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={showNotes}
          className={showNotes ? "pan-tab on" : "pan-tab"}
          onClick={() => setTab("notes")}
        >
          Notes
        </button>
      </div>
      <div className="pan-body">
        {showApprovals ? <ApprovalsPanel /> : showNotes ? <NotesPanel /> : <MyDayPanel />}
      </div>
    </aside>
  );
}
