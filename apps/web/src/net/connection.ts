import { Client, getStateCallbacks, type Room } from "@colyseus/sdk";
import {
  CLIENT_MESSAGE,
  ChatHistory,
  ChatMessage,
  JoinOptions,
  PROTOCOL_VERSION,
  RECONNECT_SECONDS,
  RecordsChanged,
  SERVER_MESSAGE,
  ServerError,
  WORKSPACE_ID,
  ZoneEvent,
  type AvatarLook,
  type ChatMessage as ChatMessageView,
  type PlayerView,
  type Status,
} from "@office/shared";
import { useRecords } from "../api/records.js";
import { getAuthToken } from "../auth/session.js";
import { useMe } from "../office/me.js";
import {
  toNpcView,
  toPlayerView,
  type RawNpcState,
  type RawPlayerState,
} from "./interp.js";
import { useNet } from "./store.js";

/**
 * The office room connection (P2-B task 1): `@colyseus/sdk` to `VITE_SERVER_URL`, the
 * token in `client.auth.token`, join `office` with `JoinOptions`, state through
 * `getStateCallbacks(room)`, status into the net store.
 *
 * With no server the office stays single-player: the join is retried a few times with
 * backoff and then gives up quietly (`offline`), exactly as today. A dropped room
 * reconnects with backoff inside the server's `RECONNECT_SECONDS` window
 * (`reconnecting`), falling back to a fresh join when the window expires.
 *
 * The local avatar reads its snapshots through `getSelfSnapshot()` and sends through
 * `netSend`; both are plain module state, so the frame loop never re-renders React.
 */

type OfficeRoom = Room;

interface RawState {
  players: Map<string, RawPlayerState>;
  npcs: Map<string, RawNpcState>;
}

export interface NetError {
  code: string;
  message: string;
  /** Counts every error received; the avatar handles each number once. */
  n: number;
}

const JOIN_BACKOFF_MS = [0, 500, 1500, 3500];
const RECONNECT_BACKOFF_MS = [500, 1000, 2000, 4000, 8000];

let generation = 0;
let client: Client | null = null;
let room: OfficeRoom | null = null;
let reconnectionToken: string | null = null;
let latestSelf: PlayerView | null = null;
let lastError: NetError | null = null;
let errorCount = 0;

export function serverUrl(): string {
  return import.meta.env.VITE_SERVER_URL ?? "http://localhost:2567";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setRoom(next: OfficeRoom | null): void {
  room = next;
  if (next) reconnectionToken = next.reconnectionToken;
}

/** True while the avatar should run the online simulation (including reconnect grace). */
export function isOnline(): boolean {
  const status = useNet.getState().status;
  return (
    (status === "online" || status === "reconnecting") &&
    useNet.getState().selfId !== null
  );
}

/** The latest snapshot of the local player, or null before the first one arrives. */
export function getSelfSnapshot(): PlayerView | null {
  return latestSelf;
}

export function getLastError(): NetError | null {
  return lastError;
}

function noteError(code: string, message: string): void {
  errorCount += 1;
  lastError = { code, message, n: errorCount };
}

/** Every message the client sends; each is a no-op until a room is attached. */
export const netSend = {
  moveIntent(seq: number, dx: -1 | 0 | 1, dz: -1 | 0 | 1, run: boolean): void {
    room?.send(CLIENT_MESSAGE.moveIntent, { seq, dx, dz, run });
  },
  moveTarget(seq: number, x: number, z: number): void {
    room?.send(CLIENT_MESSAGE.moveTarget, { seq, x, z });
  },
  activityStart(seq: number, targetId: string): void {
    room?.send(CLIENT_MESSAGE.activityStart, { seq, targetId });
  },
  activityStop(seq: number): void {
    room?.send(CLIENT_MESSAGE.activityStop, { seq });
  },
  chat(text: string): void {
    room?.send(CLIENT_MESSAGE.chatSend, { text });
  },
  status(status: Status): void {
    room?.send(CLIENT_MESSAGE.statusSet, { status });
  },
  look(): void {
    const look = useMe.getState().look;
    room?.send(CLIENT_MESSAGE.lookSet, { look });
  },
};

const offlineSend = {
  chat: () => undefined,
  status: () => undefined,
};

function joinOptions(): JoinOptions {
  const me = useMe.getState();
  return JoinOptions.parse({
    protocol: PROTOCOL_VERSION,
    displayName: me.name.trim() || "Maya",
    workspaceId: WORKSPACE_ID,
    look: me.look,
  });
}

function attach(newRoom: OfficeRoom, gen: number): void {
  setRoom(newRoom);
  latestSelf = null;
  const selfId = newRoom.sessionId;
  useNet.setState({
    status: "online",
    selfId,
    players: {},
    npcs: {},
    chat: [],
    send: { chat: (text) => netSend.chat(text), status: (s) => netSend.status(s) },
  });

  newRoom.onMessage(SERVER_MESSAGE.chat, (message: unknown) => {
    if (gen !== generation) return;
    const parsed = ChatMessage.safeParse(message);
    if (!parsed.success) return;
    const view: ChatMessageView = parsed.data;
    useNet.setState((s) => ({ chat: [...s.chat, view].slice(-200) }));
  });
  newRoom.onMessage(SERVER_MESSAGE.chatHistory, (message: unknown) => {
    if (gen !== generation) return;
    const parsed = ChatHistory.safeParse(message);
    if (!parsed.success) return;
    useNet.setState({ chat: parsed.data.messages });
  });
  newRoom.onMessage(SERVER_MESSAGE.recordsChanged, (message: unknown) => {
    if (gen !== generation) return;
    const parsed = RecordsChanged.safeParse(message);
    if (!parsed.success) return;
    void useRecords.getState().refetch(parsed.data.kinds);
  });
  newRoom.onMessage(SERVER_MESSAGE.zoneEvent, (message: unknown) => {
    if (gen !== generation) return;
    ZoneEvent.safeParse(message); // validated; no UI consumes it yet
  });
  newRoom.onMessage(SERVER_MESSAGE.error, (message: unknown) => {
    if (gen !== generation) return;
    const parsed = ServerError.safeParse(message);
    if (!parsed.success) {
      noteError("invalid_message", "the server sent an unreadable error");
      return;
    }
    noteError(parsed.data.code, parsed.data.message);
  });
  newRoom.onError((code: number, message?: string) => {
    console.warn(`[net] room error ${code}: ${message ?? "no detail"}`);
  });
  // The SDK would retry a drop internally without telling us; P2-B drives
  // reconnection itself (ARCHITECTURE.md 12.2), so that stays off and every drop
  // ends here. A consented leave (stopNet) never reaches onDrop at all.
  newRoom.reconnection.enabled = false;
  newRoom.onDrop(() => {
    if (gen !== generation) return;
    useNet.setState({ status: "reconnecting", send: { ...offlineSend } });
  });
  newRoom.onLeave(() => {
    if (gen !== generation) return;
    // A consented leave (stopNet) already moved on; anything else is a drop.
    if (room === newRoom) setRoom(null);
    void reconnectLoop(gen);
  });

  const $ = getStateCallbacks(newRoom);
  const state = newRoom.state as unknown as RawState;
  $(state).players.onAdd((player: RawPlayerState, id: string) => {
    if (gen !== generation) return;
    const view = toPlayerView(player);
    if (id === selfId) latestSelf = view;
    useNet.setState((s) => ({ players: { ...s.players, [id]: view } }));
    const refresh = () => {
      if (gen !== generation) return;
      const next = toPlayerView(player);
      if (id === selfId) latestSelf = next;
      useNet.setState((s) => ({ players: { ...s.players, [id]: next } }));
    };
    $(player).onChange(refresh);
    // A patch touching only a nested child (a look_set changes nothing else) does not
    // trigger the parent's onChange, so the children report too; toPlayerView re-reads
    // the live decoder object, making a repeated refresh harmless.
    $(player.look).onChange(refresh);
    $(player.activity).onChange(refresh);
  });
  $(state).players.onRemove((_player: RawPlayerState, id: string) => {
    if (gen !== generation) return;
    if (id === selfId) latestSelf = null;
    useNet.setState((s) => {
      const rest = { ...s.players };
      delete rest[id];
      return { players: rest };
    });
  });
  $(state).npcs.onAdd((npc: RawNpcState, id: string) => {
    if (gen !== generation) return;
    const view = toNpcView(npc);
    useNet.setState((s) => ({ npcs: { ...s.npcs, [id]: view } }));
    const refresh = () => {
      if (gen !== generation) return;
      const next = toNpcView(npc);
      useNet.setState((s) => ({ npcs: { ...s.npcs, [id]: next } }));
    };
    $(npc).onChange(refresh);
    $(npc.look).onChange(refresh); // nested-only patches do not reach the parent
  });
  $(state).npcs.onRemove((_npc: RawNpcState, id: string) => {
    if (gen !== generation) return;
    useNet.setState((s) => {
      const rest = { ...s.npcs };
      delete rest[id];
      return { npcs: rest };
    });
  });
}

/** A look change sends `look_set` (P2-B task 4); the join options carry the first look.
 * Compared and sent from the avatar's online tick, the same path as movement: a look
 * picked while offline (or mid-reconnect) goes out on the next tick with a room attached.
 * `lastSentLook` is the look the current seat joined with, or last sent for it. */
let lastSentLook: AvatarLook | null = null;

export function syncLook(): void {
  const look = useMe.getState().look;
  if (room && look !== lastSentLook) {
    lastSentLook = look;
    netSend.look();
  }
}

/**
 * Start the connection in the background. Idempotent per mount generation: calling it
 * again while a connection lives does nothing, and `stopNet` cancels a pending join.
 */
export function startNet(): void {
  if (room || useNet.getState().status !== "offline") return;
  const gen = generation + 1;
  generation = gen;
  useNet.setState({ status: "connecting" });
  void joinLoop(gen);
}

export function stopNet(): void {
  generation += 1;
  const leaving = room;
  setRoom(null);
  reconnectionToken = null;
  latestSelf = null;
  client = null;
  // Remote people are cleared: frozen ghosts must not linger in single-player.
  useNet.setState({ status: "offline", selfId: null, players: {}, npcs: {}, send: { ...offlineSend } });
  if (leaving) void leaving.leave().catch(() => undefined);
}

async function joinLoop(gen: number): Promise<void> {
  for (const wait of JOIN_BACKOFF_MS) {
    if (gen !== generation) return;
    if (wait > 0) await sleep(wait);
    if (gen !== generation) return;
    try {
      const next = new Client(serverUrl());
      // The auth session's token (`dev:<name>` locally, the Supabase JWT otherwise),
      // read fresh on every attempt so a refreshed token is used on the next (re)connect.
      next.auth.token = (await getAuthToken()) ?? "";
      const opts = joinOptions();
      const newRoom = (await next.joinOrCreate("office", opts)) as OfficeRoom;
      if (gen !== generation) {
        void newRoom.leave().catch(() => undefined);
        return;
      }
      lastSentLook = opts.look;
      client = next;
      attach(newRoom, gen);
      return;
    } catch (err) {
      if (gen !== generation) return;
      console.warn(`[net] join failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (gen !== generation) return;
  // No server: the office stays single-player, exactly as today.
  useNet.setState({ status: "offline", selfId: null, players: {}, npcs: {} });
}

async function reconnectLoop(gen: number): Promise<void> {
  if (gen !== generation || !client || !reconnectionToken) {
    if (gen === generation) {
      useNet.setState({ status: "offline", selfId: null, players: {}, npcs: {}, send: { ...offlineSend } });
    }
    return;
  }
  useNet.setState({ status: "reconnecting", send: { ...offlineSend } });
  const token = reconnectionToken;
  const deadline = Date.now() + RECONNECT_SECONDS * 1000;
  let attempt = 0;
  while (Date.now() < deadline) {
    if (gen !== generation) return;
    await sleep(RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)]);
    if (gen !== generation) return;
    attempt += 1;
    try {
      const current = client;
      if (!current) return;
      const fresh = await getAuthToken();
      if (fresh) {
        current.auth.token = fresh;
      }
      const newRoom = (await current.reconnect(token)) as OfficeRoom;
      if (gen !== generation) {
        void newRoom.leave().catch(() => undefined);
        return;
      }
      attach(newRoom, gen);
      return;
    } catch (err) {
      if (gen !== generation) return;
      console.warn(`[net] reconnect failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  // The window expired: try a fresh seat a few times, then go single-player.
  if (gen !== generation) return;
  await joinLoop(gen);
}

export interface OfficeNetHook {
  status(): string;
  selfId(): string | null;
  players(): Pick<
    PlayerView,
    "id" | "userId" | "name" | "x" | "z" | "pose" | "lastSeq" | "look"
  >[];
  lastError(): NetError | null;
  serverUrl(): string;
  /** Drop the socket without consent, as if the network failed (reconnect drill). */
  drop(): void;
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  const hook: OfficeNetHook = {
    status: () => useNet.getState().status,
    selfId: () => useNet.getState().selfId,
    players: () =>
      Object.values(useNet.getState().players).map((p) => ({
        id: p.id,
        userId: p.userId,
        name: p.name,
        x: p.x,
        z: p.z,
        pose: p.pose,
        lastSeq: p.lastSeq,
        look: p.look,
      })),
    lastError: () => lastError,
    serverUrl: () => serverUrl(),
    drop: () => {
      void room?.leave(false);
    },
  };
  (window as unknown as Record<string, unknown>).__officeNet = hook;
}
