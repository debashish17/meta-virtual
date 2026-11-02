import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { api } from "../api/index.js";
import { useRecords } from "../api/records.js";
import type { CallVideo } from "./room.js";
import TranscriptPanel from "./captions/TranscriptPanel.js";
import { clearCaptions, endMeeting, finalSegments } from "./captions/index.js";
import {
  debugAddPeer,
  debugPeerScreen,
  debugRemovePeer,
  startCallWatcher,
  useCalls,
  useMockRoom,
  type CallPhase,
} from "./store.js";
import { zoneName } from "./zones.js";
import "./calls.css";

/** DEV-only hook for manual checks and the e2e spec (never installed in production). */
export interface CallsDebugHook {
  state(): {
    phase: CallPhase;
    zoneId: string | null;
    notice: string | null;
    listenOnly: boolean;
    micOn: boolean;
    camOn: boolean;
    sharing: boolean;
    peers: string[];
    screen: string | null;
    collapsed: boolean;
  };
  useMockRoom(): void;
  addPeer(identity: string, name: string, options?: { camera?: boolean }): void;
  removePeer(identity: string): void;
  peerScreen(identity: string | null): void;
}

declare global {
  interface Window {
    __callsDebug?: CallsDebugHook;
  }
}

/** One camera tile: the track's element is attached for as long as the tile lives. */
function Tile({ testid, label, video, muted }: { testid: string; label: string; video: CallVideo; muted: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const div = host.current;
    if (!div) return;
    const el = video.attach();
    div.prepend(el);
    return () => {
      video.detach(el);
      el.remove();
    };
  }, [video]);
  return (
    <div className="call-tile" data-testid={testid}>
      <div className="call-video" ref={host} />
      <span className="call-name">
        {label}
        {muted && (
          <span className="call-muted" aria-label="muted">
            {" "}· muted
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * The call UI (P5-B task 2): a call bar (mute, camera, screen share, leave)
 * with camera tiles, docked bottom-right in the drawer column, collapsible,
 * never over the centre of the floor. Idle renders nothing, so the office and
 * the fixture demo are unchanged until the avatar enters a meeting-room zone.
 *
 * The panel portals to `document.body`: inside the panels root its z-index is
 * trapped by a fixed-position ancestor and the dev name chip (same corner)
 * would eat the Share and Leave clicks.
 */
export default function CallPanel() {
  const phase = useCalls((s) => s.phase);
  const zoneId = useCalls((s) => s.zoneId);
  const notice = useCalls((s) => s.notice);
  const listenOnly = useCalls((s) => s.listenOnly);
  const micOn = useCalls((s) => s.micOn);
  const camOn = useCalls((s) => s.camOn);
  const sharing = useCalls((s) => s.sharing);
  const selfCamera = useCalls((s) => s.selfCamera);
  const peers = useCalls((s) => s.peers);
  const screenShare = useCalls((s) => s.screen);
  const localIdentity = useCalls((s) => s.localIdentity);
  const collapsed = useCalls((s) => s.collapsed);
  const setCollapsed = useCalls((s) => s.setCollapsed);
  const dismiss = useCalls((s) => s.dismiss);
  const toggleMute = useCalls((s) => s.toggleMute);
  const toggleCamera = useCalls((s) => s.toggleCamera);
  const toggleShare = useCalls((s) => s.toggleShare);
  const leaveCall = useCalls((s) => s.leaveCall);

  useEffect(() => {
    startCallWatcher();
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__callsDebug = {
      state: () => {
        const s = useCalls.getState();
        return {
          phase: s.phase,
          zoneId: s.zoneId,
          notice: s.notice,
          listenOnly: s.listenOnly,
          micOn: s.micOn,
          camOn: s.camOn,
          sharing: s.sharing,
          peers: s.peers.map((p) => p.name),
          screen: s.screen?.fromName ?? null,
          collapsed: s.collapsed,
        };
      },
      useMockRoom,
      addPeer: (identity, name, options) => debugAddPeer(identity, name, options),
      removePeer: (identity) => debugRemovePeer(identity),
      peerScreen: (identity) => debugPeerScreen(identity),
    };
    return () => {
      delete window.__callsDebug;
    };
  }, []);

  async function endMeetingFromBar(): Promise<void> {
    if (!zoneId) return;
    // Explicit "End meeting" (P5-C R3): post, then leave. Empty stays with the
    // notice visible so it can be seen; failures do the same.
    const result = await endMeeting(
      { api, refetch: (kinds) => useRecords.getState().refetch(kinds) },
      { zoneId, segments: [...finalSegments()] },
    ).catch((): null => null);
    if (!result) {
      useCalls.setState({ notice: "Could not post the transcript." });
      return;
    }
    if ("notice" in result) {
      useCalls.setState({ notice: result.notice });
      return;
    }
    clearCaptions();
    leaveCall();
  }

  if (phase === "idle") return null;

  if (collapsed) {
    return createPortal(
      <button
        type="button"
        className="call-tab"
        aria-expanded="false"
        aria-label="Open call panel"
        onClick={() => setCollapsed(false)}
      >
        Call{phase === "live" ? ` (${peers.length + 1})` : ""}
      </button>,
      document.body,
    );
  }

  const title = zoneName(zoneId);
  return createPortal(
    <section className="call-panel" aria-label="Call" data-testid="call-panel">
      <header className="call-head">
        <h2>
          {title}
          {phase === "live" && listenOnly && <span className="call-sub"> · listening only</span>}
        </h2>
        <button
          type="button"
          className="call-collapse"
          aria-label="Collapse call panel"
          onClick={() => setCollapsed(true)}
        >
          ×
        </button>
      </header>

      {phase === "joining" && (
        <p className="call-status" role="status">
          Joining the call…
        </p>
      )}

      {phase === "unavailable" && (
        <div className="call-status" role="status">
          <p data-testid="call-notice">{notice}</p>
          <button type="button" className="call-btn" onClick={dismiss}>
            Dismiss
          </button>
        </div>
      )}

      {phase === "live" && (
        <>
          {notice && (
            <p className="call-notice" role="status" data-testid="call-notice">
              {notice}
            </p>
          )}
          <div className="call-tiles">
            {selfCamera && <Tile testid="call-tile-self" label="You" video={selfCamera} muted={!micOn} />}
            {screenShare && (
              <Tile
                testid="call-tile-screen"
                label={
                  screenShare.from === localIdentity
                    ? "Your screen"
                    : `${screenShare.fromName}'s screen`
                }
                video={screenShare.video}
                muted={false}
              />
            )}
            {peers.map((peer) =>
              peer.camera ? (
                <Tile
                  key={peer.identity}
                  testid={`call-tile-${peer.identity}`}
                  label={peer.name}
                  video={peer.camera}
                  muted={peer.micMuted}
                />
              ) : null,
            )}
          </div>
          <div className="call-bar" role="toolbar" aria-label="Call controls">
            <button
              type="button"
              className={micOn && !listenOnly ? "call-btn on" : "call-btn"}
              aria-pressed={micOn && !listenOnly}
              onClick={() => void toggleMute()}
            >
              {micOn && !listenOnly ? "Mute" : "Unmute"}
            </button>
            <button
              type="button"
              className={camOn ? "call-btn on" : "call-btn"}
              aria-pressed={camOn}
              onClick={() => void toggleCamera()}
            >
              Camera
            </button>
            <button
              type="button"
              className={sharing ? "call-btn on" : "call-btn"}
              aria-pressed={sharing}
              onClick={() => void toggleShare()}
            >
              Share
            </button>
            <button type="button" className="call-btn danger" onClick={leaveCall}>
              Leave
            </button>
            <button
              type="button"
              className="call-btn"
              disabled={!zoneId}
              onClick={() => void endMeetingFromBar()}
            >
              End meeting
            </button>
          </div>
          {zoneId ? <TranscriptPanel zoneId={zoneId} zoneName={title} /> : null}
        </>
      )}
    </section>,
    document.body,
  );
}
