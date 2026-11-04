import { useCallback, useEffect, useState } from "react";
import { api } from "../api/index.js";
import { useRecords } from "../api/records.js";
import { OVERVIEW } from "../office/state.js";
import { processAcmeMeeting } from "./actions.js";
import CallPanel from "../calls/CallPanel.js";
import AskPanel from "./AskPanel.js";
import ChatPanel from "./ChatPanel.js";
import MeetingBar from "./MeetingBar.js";
import Notices from "./Notices.js";
import Participants from "./Participants.js";
import RightDrawer from "./RightDrawer.js";
import BookingPanel from "../bookings/BookingPanel.js";
import BoardOverlay from "../board/BoardOverlay.js";
import OfficeLifeBar from "../officeLife/OfficeLifeBar.js";
import ZonePill from "../office/ZonePill.js";
import { isMovementKey } from "./format.js";
import "./panels.css";

declare global {
  interface Window {
    __panelsDebug?: { processMeeting: () => Promise<unknown>; ask: (question: string) => Promise<unknown> };
  }
}

/**
 * The product panels (DESIGN_SPEC 9), mounted next to `<Hud />` in `OfficeScene`:
 * participants, chat, ask, the right drawer (My day / approvals), the meeting action
 * and notices. Reads through the records and net stores only; the avatar's movement
 * keys are swallowed on keydown (never keyup) so a focused control never walks it.
 */
export default function Panels() {
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useCallback(() => {
    setLoadError(null);
    return useRecords
      .getState()
      .load()
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "could not load records"));
  }, []);
  useEffect(() => {
    void load();
    if (import.meta.env.DEV) {
      window.__panelsDebug = { processMeeting: () => processAcmeMeeting(), ask: (q) => api.ask(q) };
    }
  }, [load]);
  if (OVERVIEW) return null;
  return (
    <div
      className="pan-root"
      onKeyDown={(e) => {
        if (isMovementKey(e.code)) e.stopPropagation();
      }}
    >
      {/* The overlay frame (panels.css): top strip (where you are, your status, booking)
          with the room's action and notices under it; the left column (people, call,
          chat); the ask bar; the right drawer. Under 1280 px the wrappers dissolve
          (display: contents) and each panel keeps its own narrow docking. */}
      <div className="pan-strip">
        <ZonePill />
        <OfficeLifeBar />
        <BookingPanel />
      </div>
      <div className="pan-topstack">
        <Notices loadError={loadError} onRetry={() => void load()} />
        <MeetingBar />
      </div>
      <div className="pan-left">
        <Participants />
        <div className="pan-left-end">
          <div className="pan-call-slot" />
          <ChatPanel />
        </div>
      </div>
      <CallPanel />
      <AskPanel />
      <RightDrawer />
      <BoardOverlay />
    </div>
  );
}
