/**
 * The call-room seam (P5-B): everything the calls store needs from a LiveKit room,
 * as a narrow interface. `liveRoom.ts` adapts the real `livekit-client` Room and
 * `mockRoom.ts` is the in-memory double the unit tests (and, DEV-only through
 * `__callsDebug`, the e2e spec) drive. The store never imports livekit-client.
 */

/** One subscribed video track: the tile or wall display attaches its own element. */
export interface CallVideo {
  attach(): HTMLVideoElement;
  detach(el: HTMLVideoElement): void;
}

export interface CallPeerSnapshot {
  identity: string;
  name: string;
  camera: CallVideo | null;
  micMuted: boolean;
}

export interface ScreenShareSnapshot {
  from: string;
  fromName: string;
  video: CallVideo;
}

export type CallRoomEvent =
  | { type: "peers"; peers: CallPeerSnapshot[] }
  | { type: "screen"; screen: ScreenShareSnapshot | null }
  | { type: "selfCamera"; video: CallVideo | null }
  /** The room dropped unexpectedly (an intentional `disconnect()` never emits this). */
  | { type: "disconnected" };

export type CallRoomHandler = (event: CallRoomEvent) => void;

export interface CallRoom {
  readonly localIdentity: string;
  onEvent(handler: CallRoomHandler): void;
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  setCameraEnabled(enabled: boolean): Promise<void>;
  setScreenShareEnabled(enabled: boolean): Promise<void>;
  disconnect(): Promise<void>;
}

/** Creates and connects a room; rejects when the URL cannot be reached. */
export type RoomFactory = (url: string, token: string) => Promise<CallRoom>;
