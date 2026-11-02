import { create } from "zustand";
import type { Status } from "@office/shared";
import { api } from "../api/index.js";
import { useRecords } from "../api/records.js";
import { netSend } from "../net/connection.js";
import { useNet } from "../net/store.js";
import { useMe } from "../office/me.js";
import {
  clearCaptions,
  createCaptionRecognizer,
  endMeeting,
  finalSegments,
  type CaptionRecognizer,
} from "./captions/index.js";
import { createLiveRoom } from "./liveRoom.js";
import { MockRoom, type MockPeerOptions } from "./mockRoom.js";
import type {
  CallPeerSnapshot,
  CallRoom,
  CallRoomEvent,
  CallVideo,
  RoomFactory,
  ScreenShareSnapshot,
} from "./room.js";
import { fetchCallToken, type TokenFetchDeps } from "./tokens.js";
import { isCallableZone } from "./zones.js";

export type CallPhase = "idle" | "joining" | "live" | "unavailable";

/** Every token or connection failure maps to this one notice. */
export const CALLS_UNAVAILABLE = "Calls unavailable";
/** A failed microphone enable never blocks the call: the user listens only. */
export const LISTEN_ONLY_NOTICE = "Microphone unavailable — you're listening only.";

export interface CallsState {
  phase: CallPhase;
  /** The zone of the current call or attempt (null when idle). */
  zoneId: string | null;
  notice: string | null;
  listenOnly: boolean;
  micOn: boolean;
  camOn: boolean;
  sharing: boolean;
  selfCamera: CallVideo | null;
  peers: CallPeerSnapshot[];
  screen: ScreenShareSnapshot | null;
  /** The LiveKit identity of the local participant (null when idle). */
  localIdentity: string | null;
  collapsed: boolean;
  /**
   * The zone the user left or dismissed the call in: no auto-rejoin until the
   * avatar leaves and returns.
   */
  suppressedZone: string | null;
  setCollapsed(collapsed: boolean): void;
  /** Hides "Calls unavailable" for this visit (re-entry retries). */
  dismiss(): void;
  toggleMute(): Promise<void>;
  toggleCamera(): Promise<void>;
  toggleShare(): Promise<void>;
  /** Leaves the call without leaving the room (re-entry rejoins). */
  leaveCall(): void;
}

const IDLE: Pick<
  CallsState,
  | "phase"
  | "zoneId"
  | "notice"
  | "listenOnly"
  | "micOn"
  | "camOn"
  | "sharing"
  | "selfCamera"
  | "peers"
  | "screen"
  | "localIdentity"
> = {
  phase: "idle",
  zoneId: null,
  notice: null,
  listenOnly: false,
  micOn: false,
  camOn: false,
  sharing: false,
  selfCamera: null,
  peers: [],
  screen: null,
  localIdentity: null,
};

export const useCalls = create<CallsState>()((set, get) => ({
  ...IDLE,
  collapsed: false,
  suppressedZone: null,
  setCollapsed: (collapsed) => set({ collapsed }),
  dismiss: () => {
    if (get().phase !== "unavailable") return;
    set({ ...IDLE, suppressedZone: get().zoneId, collapsed: get().collapsed });
  },
  toggleMute: () => toggleMute(),
  toggleCamera: () => toggleCamera(),
  toggleShare: () => toggleShare(),
  leaveCall: () => {
    const { zoneId } = get();
    cancelCall();
    set({ suppressedZone: zoneId });
  },
}));

// --- module state (never rendered) -------------------------------------------

let roomFactory: RoomFactory = createLiveRoom;
let tokenDeps: TokenFetchDeps = {};
let watcherStarted = false;
/** Counts join attempts; a stale continuation (leave before resolve) exits quietly. */
let generation = 0;
let activeRoom: CallRoom | null = null;
/** Our speech recognizer while live (P5-C R2); null when unsupported or idle. */
let activeRecognizer: CaptionRecognizer | null = null;
let lastZone: string | null = null;
/** The self status to restore when the call ends (null when none was set). */
let restoreStatus: Status | null = null;

/** Tests and the DEV-only `__callsDebug` mock arm a different room factory. */
export function setRoomFactory(factory: RoomFactory): void {
  roomFactory = factory;
}

/** Tests inject a stubbed token fetch; the app always uses the real one. */
export function setTokenDeps(deps: TokenFetchDeps): void {
  tokenDeps = deps;
}

/** The avatar's zone from the net store, or null when it cannot be in a call. */
function selfZone(): string | null {
  const net = useNet.getState();
  if ((net.status !== "online" && net.status !== "reconnecting") || !net.selfId) return null;
  return net.players[net.selfId]?.zoneId ?? null;
}

function sendStatus(status: Status): void {
  useNet.getState().send.status(status);
}

/** Restores the pre-call status, unless the user changed it mid-call. */
function restorePreviousStatus(): void {
  if (restoreStatus === null) return;
  const next = restoreStatus;
  restoreStatus = null;
  const net = useNet.getState();
  const self = net.selfId ? net.players[net.selfId] : undefined;
  if (self?.status === "in_meeting") sendStatus(next);
}

/**
 * Ends any call or attempt silently (the notice, if any, is cleared too).
 * `restore` is false only for a room-to-room walk, where the pre-call status
 * carries over to the next join instead of being restored and recaptured.
 */
function cancelCall(restore = true): void {
  generation += 1;
  if (activeRecognizer) {
    activeRecognizer.stop();
    activeRecognizer = null;
  }
  // Last one out posts the transcript (P5-C R3): peers remaining means the meeting
  // continues. Silent when nothing was captured — leaving a quiet call must not nag.
  const leaving = useCalls.getState();
  const segments = [...finalSegments()];
  clearCaptions();
  if (leaving.phase === "live" && leaving.zoneId && leaving.peers.length === 0 && segments.length > 0) {
    const zoneId = leaving.zoneId;
    void endMeeting(
      { api, refetch: (kinds) => useRecords.getState().refetch(kinds) },
      { zoneId, segments },
    ).catch(() => undefined);
  }
  const room = activeRoom;
  activeRoom = null;
  if (restore) restorePreviousStatus();
  if (room) void room.disconnect().catch(() => undefined);
  useCalls.setState({ ...IDLE, collapsed: useCalls.getState().collapsed });
}

function failJoin(gen: number): void {
  if (gen !== generation) return;
  activeRoom = null;
  // A fresh join never sent a status, so this only clears; a carried-over
  // room-to-room status is restored, since no call is live now.
  restorePreviousStatus();
  useCalls.setState({ phase: "unavailable", notice: CALLS_UNAVAILABLE });
}

async function joinCall(zoneId: string): Promise<void> {
  const gen = generation + 1;
  generation = gen;
  // A room-to-room walk carries the original pre-call status over: the
  // snapshot still shows "in_meeting" until the server echo arrives, so
  // recapturing here would strand the status on "in_meeting" at leave.
  if (restoreStatus === null) {
    const net = useNet.getState();
    restoreStatus = net.selfId ? (net.players[net.selfId]?.status ?? "available") : "available";
  }
  useCalls.setState({
    ...IDLE,
    phase: "joining",
    zoneId,
    collapsed: false,
    suppressedZone: useCalls.getState().suppressedZone,
  });

  let creds: { url: string; token: string };
  try {
    creds = await fetchCallToken(zoneId, tokenDeps);
  } catch {
    failJoin(gen);
    return;
  }
  if (gen !== generation) return;

  let room: CallRoom;
  try {
    room = await roomFactory(creds.url, creds.token);
  } catch {
    failJoin(gen);
    return;
  }
  if (gen !== generation) {
    void room.disconnect().catch(() => undefined);
    return;
  }
  activeRoom = room;
  room.onEvent((event) => handleRoomEvent(gen, event));

  // The first join asks for the microphone; denial (or any failure) joins
  // listen-only with a notice, never blocked and never unavailable.
  let micOn = false;
  let listenOnly = false;
  try {
    await room.setMicrophoneEnabled(true);
    micOn = true;
  } catch {
    listenOnly = true;
  }
  if (gen !== generation) return;
  sendStatus("in_meeting");
  useCalls.setState({
    phase: "live",
    localIdentity: room.localIdentity,
    micOn,
    listenOnly,
    notice: listenOnly ? LISTEN_ONLY_NOTICE : null,
  });
  // Caption our own speech while live (P5-C R2): the recognizer owns its
  // denial/unsupported paths, so this starts unconditionally.
  activeRecognizer = createCaptionRecognizer((text, final) => netSend.caption(text, final));
  activeRecognizer.start();
}

function handleRoomEvent(gen: number, event: CallRoomEvent): void {
  if (gen !== generation) return;
  switch (event.type) {
    case "peers":
      useCalls.setState({ peers: event.peers });
      break;
    case "screen":
      useCalls.setState({ screen: event.screen });
      break;
    case "selfCamera":
      useCalls.setState({ selfCamera: event.video });
      break;
    case "disconnected": {
      // An unexpected drop ends the call but keeps the bar with the notice.
      generation += 1;
      const room = activeRoom;
      activeRoom = null;
      restorePreviousStatus();
      if (room) void room.disconnect().catch(() => undefined);
      useCalls.setState({
        ...IDLE,
        phase: "unavailable",
        zoneId: useCalls.getState().zoneId,
        notice: CALLS_UNAVAILABLE,
        collapsed: useCalls.getState().collapsed,
        suppressedZone: useCalls.getState().suppressedZone,
      });
      break;
    }
  }
}

function onZone(zone: string | null): void {
  if (zone === lastZone) {
    // Snapshots arrive constantly; only an idle watcher already inside a room
    // (it mounted late, or the socket just came back) has anything to do.
    const state = useCalls.getState();
    if (
      zone &&
      state.phase === "idle" &&
      state.suppressedZone !== zone &&
      isCallableZone(zone)
    ) {
      void joinCall(zone);
    }
    return;
  }
  lastZone = zone;
  const state = useCalls.getState();
  if (state.phase === "live" || state.phase === "joining" || state.phase === "unavailable") {
    // Room-to-room: the pre-call status carries over to the next join (no
    // intermediate restore whose echo would arrive after the recapture).
    const keepStatus = !!zone && isCallableZone(zone) && state.suppressedZone !== zone;
    cancelCall(!keepStatus);
  }
  if (zone !== useCalls.getState().suppressedZone) {
    useCalls.setState({ suppressedZone: null });
  }
  if (zone && isCallableZone(zone) && useCalls.getState().suppressedZone !== zone) {
    void joinCall(zone);
  }
}

/**
 * Follows the avatar: entering a meeting-room zone joins its call, leaving
 * disconnects. Idempotent; the call panel mounts it once. Offline (or never
 * connected) the watcher stays idle, so the fixture demo is untouched.
 */
export function startCallWatcher(): void {
  if (watcherStarted) return;
  watcherStarted = true;
  lastZone = selfZone();
  if (lastZone && isCallableZone(lastZone)) void joinCall(lastZone);
  useNet.subscribe(() => onZone(selfZone()));
}

/** Silence a room the store no longer owns (tests). */
function silence(room: CallRoom | null): void {
  if (room) void room.disconnect().catch(() => undefined);
}

export function resetCallsForTests(): void {
  generation += 1;
  silence(activeRoom);
  activeRoom = null;
  restoreStatus = null;
  lastZone = null;
  tokenDeps = {};
  roomFactory = createLiveRoom;
  watcherStarted = false;
  useCalls.setState({ ...IDLE, collapsed: false, suppressedZone: null });
}

async function toggleMute(): Promise<void> {
  const room = activeRoom;
  if (!room || useCalls.getState().phase !== "live") return;
  const { micOn, listenOnly } = useCalls.getState();
  if (micOn && !listenOnly) {
    try {
      await room.setMicrophoneEnabled(false);
    } catch {
      useCalls.setState({ notice: "Couldn't mute the microphone." });
      return;
    }
    useCalls.setState({ micOn: false });
    return;
  }
  // Unmuting (or retrying after a denial) asks for the microphone again.
  try {
    await room.setMicrophoneEnabled(true);
  } catch {
    useCalls.setState({ listenOnly: true, micOn: false, notice: LISTEN_ONLY_NOTICE });
    return;
  }
  useCalls.setState({ micOn: true, listenOnly: false, notice: null });
}

async function toggleCamera(): Promise<void> {
  const room = activeRoom;
  if (!room || useCalls.getState().phase !== "live") return;
  const next = !useCalls.getState().camOn;
  try {
    await room.setCameraEnabled(next);
  } catch {
    useCalls.setState({ notice: "Couldn't change the camera." });
    return;
  }
  useCalls.setState({ camOn: next });
}

async function toggleShare(): Promise<void> {
  const room = activeRoom;
  if (!room || useCalls.getState().phase !== "live") return;
  const next = !useCalls.getState().sharing;
  try {
    await room.setScreenShareEnabled(next);
  } catch (err) {
    // Cancelling the browser's share picker rejects with NotAllowedError: that
    // is a no, not a failure, so it stays silent.
    if (err instanceof DOMException && err.name === "NotAllowedError") return;
    useCalls.setState({ notice: "Couldn't start the screen share." });
    return;
  }
  useCalls.setState({ sharing: next });
}

// --- DEV-only test doubles ----------------------------------------------------

function activeMock(): MockRoom | null {
  return activeRoom instanceof MockRoom ? activeRoom : null;
}

/** Arms the in-memory room for the next join (DEV-only `__callsDebug`, and e2e). */
export function useMockRoom(): void {
  setRoomFactory(async (url, token) => {
    const room = new MockRoom({
      localIdentity: `mock-${useMe.getState().name.trim() || "Maya"}`,
      localName: useMe.getState().name.trim() || "Maya",
    });
    await room.connect(url, token);
    return room;
  });
}

/** Adds a remote peer to the active mock room; silent without one. */
export function debugAddPeer(identity: string, name: string, options: MockPeerOptions = {}): void {
  activeMock()?.addPeer(identity, name, options);
}

/** Removes a remote peer from the active mock room; silent without one. */
export function debugRemovePeer(identity: string): void {
  activeMock()?.removePeer(identity);
}

/** A mock peer shares its screen (null stops it); silent without a mock room. */
export function debugPeerScreen(identity: string | null): void {
  activeMock()?.publishPeerScreen(identity);
}
