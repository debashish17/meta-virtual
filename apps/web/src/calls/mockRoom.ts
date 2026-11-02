import type {
  CallPeerSnapshot,
  CallRoom,
  CallRoomHandler,
  CallVideo,
  ScreenShareSnapshot,
} from "./room.js";

/** A fake camera frame source: a canvas stream when the browser has one, else a bare element. */
function fakeStream(kind: "camera" | "screen"): MediaStream | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = kind === "camera" ? "#3f7f7a" : "#c9803f";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const capture = (
      canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }
    ).captureStream;
    if (typeof capture !== "function") return null;
    return capture.call(canvas, 5) ?? null;
  } catch {
    return null;
  }
}

/** The mock's video track: `attach()` behaves like LiveKit's (element, playing, muted). */
export class MockVideo implements CallVideo {
  constructor(private readonly kind: "camera" | "screen") {}

  attach(): HTMLVideoElement {
    const el = document.createElement("video");
    el.dataset.mockVideo = this.kind;
    el.muted = true;
    el.playsInline = true;
    const stream = fakeStream(this.kind);
    if (stream) {
      try {
        el.srcObject = stream;
      } catch {
        el.srcObject = null;
      }
    }
    try {
      const played = el.play() as unknown as Promise<void> | undefined;
      played?.catch?.(() => undefined);
    } catch {
      // jsdom has no media engine; the element is still a usable tile child.
    }
    return el;
  }

  detach(el: HTMLVideoElement): void {
    try {
      el.pause();
    } catch {
      // Already paused or never played.
    }
    try {
      el.srcObject = null;
    } catch {
      // Never attached.
    }
  }
}

export interface MockRoomOptions {
  localIdentity: string;
  localName?: string;
  /**
   * How enabling the microphone acquires audio. The default uses the real
   * `getUserMedia` when the browser has one (so the e2e denial test exercises
   * the real permission path) and succeeds silently otherwise (jsdom); tests
   * inject a stub to allow or deny.
   */
  acquireAudio?: () => Promise<unknown>;
  /** When set, `connect()` rejects with this error. */
  failConnect?: Error | null;
}

export interface MockPeerOptions {
  camera?: boolean;
  micMuted?: boolean;
}

/**
 * The in-memory `CallRoom` double: unit tests drive joins, peers and screen
 * shares through it, and the DEV-only `__callsDebug.useMockRoom()` arms it for
 * the e2e spec. Only the microphone path is real (see `acquireAudio`).
 */
export class MockRoom implements CallRoom {
  readonly localIdentity: string;
  readonly localName: string;
  connected = false;
  micEnabled = false;
  cameraEnabled = false;
  sharing = false;

  private readonly acquireAudio: () => Promise<unknown>;
  private readonly failConnect: Error | null;
  private handler: CallRoomHandler | null = null;
  private readonly peers = new Map<string, CallPeerSnapshot>();
  private selfCameraVideo: MockVideo | null = null;
  private localScreenVideo: MockVideo | null = null;
  private remoteScreen: ScreenShareSnapshot | null = null;
  private heldAudio: MediaStreamTrack[] = [];

  constructor(options: MockRoomOptions) {
    this.localIdentity = options.localIdentity;
    this.localName = options.localName ?? options.localIdentity;
    this.failConnect = options.failConnect ?? null;
    this.acquireAudio =
      options.acquireAudio ??
      (async () => {
        const media = globalThis.navigator?.mediaDevices;
        if (media?.getUserMedia) {
          const stream = await media.getUserMedia({ audio: true });
          this.heldAudio = stream.getTracks();
        }
      });
  }

  onEvent(handler: CallRoomHandler): void {
    this.handler = handler;
    this.emitPeers();
    this.emitScreen();
    this.emitSelfCamera();
  }

  async connect(url: string, token: string): Promise<void> {
    if (this.failConnect) throw this.failConnect;
    if (!url || !token) throw new Error("the mock room needs a url and token");
    this.connected = true;
    this.emitPeers();
    this.emitScreen();
    this.emitSelfCamera();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    for (const track of this.heldAudio) {
      try {
        track.stop();
      } catch {
        // Already stopped.
      }
    }
    this.heldAudio = [];
  }

  /** Drops the room unexpectedly (the test double for a network failure). */
  drop(): void {
    this.connected = false;
    this.handler?.({ type: "disconnected" });
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      await this.acquireAudio();
      this.micEnabled = true;
      return;
    }
    for (const track of this.heldAudio) {
      try {
        track.stop();
      } catch {
        // Already stopped.
      }
    }
    this.heldAudio = [];
    this.micEnabled = false;
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    this.cameraEnabled = enabled;
    if (enabled && !this.selfCameraVideo) this.selfCameraVideo = new MockVideo("camera");
    if (!enabled) this.selfCameraVideo = null;
    this.emitSelfCamera();
  }

  async setScreenShareEnabled(enabled: boolean): Promise<void> {
    this.sharing = enabled;
    this.localScreenVideo = enabled ? new MockVideo("screen") : null;
    this.emitScreen();
  }

  addPeer(identity: string, name: string, options: MockPeerOptions = {}): void {
    this.peers.set(identity, {
      identity,
      name,
      camera: options.camera ? new MockVideo("camera") : null,
      micMuted: options.micMuted ?? false,
    });
    this.emitPeers();
  }

  removePeer(identity: string): void {
    this.peers.delete(identity);
    if (this.remoteScreen?.from === identity) {
      this.remoteScreen = null;
      this.emitScreen();
    }
    this.emitPeers();
  }

  /** A remote peer starts (or, with null, stops) sharing its screen. */
  publishPeerScreen(identity: string | null): void {
    if (identity === null) {
      this.remoteScreen = null;
      this.emitScreen();
      return;
    }
    const peer = this.peers.get(identity);
    this.remoteScreen = {
      from: identity,
      fromName: peer?.name ?? identity,
      video: new MockVideo("screen"),
    };
    this.emitScreen();
  }

  private emitPeers(): void {
    const peers: CallPeerSnapshot[] = [...this.peers.values()];
    this.handler?.({ type: "peers", peers });
  }

  private emitSelfCamera(): void {
    this.handler?.({ type: "selfCamera", video: this.selfCameraVideo });
  }

  private emitScreen(): void {
    const screen: ScreenShareSnapshot | null =
      this.remoteScreen ??
      (this.localScreenVideo
        ? { from: this.localIdentity, fromName: this.localName, video: this.localScreenVideo }
        : null);
    this.handler?.({ type: "screen", screen });
  }
}
