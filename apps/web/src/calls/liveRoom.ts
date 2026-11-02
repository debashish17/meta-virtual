import type {
  RemoteParticipant,
  Room,
  Track,
  TrackPublication,
} from "livekit-client";
import type {
  CallPeerSnapshot,
  CallRoom,
  CallRoomHandler,
  CallVideo,
  RoomFactory,
  ScreenShareSnapshot,
} from "./room.js";

type LivekitSdk = typeof import("livekit-client");

let sdkPromise: Promise<LivekitSdk> | null = null;

/**
 * The LiveKit SDK, loaded on the first real join only: unit tests and the
 * fixture demo never fetch it. (`import("livekit-client")` also code-splits it
 * out of the main bundle.)
 */
function sdk(): Promise<LivekitSdk> {
  sdkPromise ??= import("livekit-client");
  return sdkPromise;
}

/** A subscribed LiveKit video track behind the `CallVideo` seam. */
class LiveKitVideo implements CallVideo {
  constructor(private readonly track: Track) {}

  attach(): HTMLVideoElement {
    return this.track.attach() as HTMLVideoElement;
  }

  detach(el: HTMLVideoElement): void {
    this.track.detach(el);
  }
}

/**
 * A connected LiveKit room behind the `CallRoom` seam: LiveKit events become
 * store snapshots (peers, self camera, screen share), remote audio plays
 * through a hidden element box, and an unexpected drop reports
 * `disconnected` (an intentional `disconnect()` never does).
 */
class LiveCallRoom implements CallRoom {
  private handler: CallRoomHandler | null = null;
  private readonly videos = new Map<Track, LiveKitVideo>();
  private readonly audioElements = new Map<Track, HTMLElement[]>();
  private audioBox: HTMLDivElement | null = null;
  private closed = false;

  constructor(
    private readonly room: Room,
    private readonly lk: LivekitSdk,
  ) {}

  /** The LiveKit identity, assigned on connect: read live, never cached. */
  get localIdentity(): string {
    return this.room.localParticipant.identity;
  }

  onEvent(handler: CallRoomHandler): void {
    this.handler = handler;
    this.refresh();
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setMicrophoneEnabled(enabled);
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setCameraEnabled(enabled);
    this.refresh();
  }

  async setScreenShareEnabled(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setScreenShareEnabled(enabled);
    this.refresh();
  }

  async disconnect(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      this.room.removeAllListeners();
    } catch {
      // Already torn down.
    }
    for (const elements of this.audioElements.values()) {
      for (const el of elements) el.remove();
    }
    this.audioElements.clear();
    this.audioBox?.remove();
    this.audioBox = null;
    await this.room.disconnect();
  }

  wire(): void {
    const { RoomEvent, Track } = this.lk;
    this.room.on(RoomEvent.ParticipantConnected, this.refresh);
    this.room.on(RoomEvent.ParticipantDisconnected, this.refresh);
    this.room.on(RoomEvent.TrackSubscribed, (track: Track) => {
      if (track.kind === Track.Kind.Audio) this.playAudio(track);
      else this.refresh();
    });
    this.room.on(RoomEvent.TrackUnsubscribed, (track: Track) => {
      try {
        track.detach();
      } catch {
        // Already detached.
      }
      this.videos.delete(track);
      this.dropAudio(track);
      this.refresh();
    });
    this.room.on(RoomEvent.TrackMuted, this.refresh);
    this.room.on(RoomEvent.TrackUnmuted, this.refresh);
    this.room.on(RoomEvent.LocalTrackPublished, this.refresh);
    this.room.on(RoomEvent.LocalTrackUnpublished, this.refresh);
    this.room.on(RoomEvent.Disconnected, () => {
      if (!this.closed) this.handler?.({ type: "disconnected" });
    });
  }

  private readonly refresh = (): void => {
    if (this.closed) return;
    const peers: CallPeerSnapshot[] = [...this.room.remoteParticipants.values()].map((p) => ({
      identity: p.identity,
      name: p.name || p.identity,
      camera: this.cameraOf(p),
      micMuted: !p.isMicrophoneEnabled,
    }));
    this.handler?.({ type: "peers", peers });
    this.handler?.({ type: "selfCamera", video: this.localCamera() });
    this.handler?.({ type: "screen", screen: this.screenShare() });
  };

  private videoFor(track: Track): LiveKitVideo {
    let video = this.videos.get(track);
    if (!video) {
      video = new LiveKitVideo(track);
      this.videos.set(track, video);
    }
    return video;
  }

  private subscribedVideo(publication: TrackPublication | undefined): LiveKitVideo | null {
    const track = publication?.isSubscribed === true ? publication.track : undefined;
    if (!track || track.kind !== this.lk.Track.Kind.Video) return null;
    return this.videoFor(track);
  }

  private cameraOf(participant: RemoteParticipant): CallVideo | null {
    return this.subscribedVideo(
      participant.getTrackPublication(this.lk.Track.Source.Camera),
    );
  }

  private localCamera(): CallVideo | null {
    return this.subscribedVideo(
      this.room.localParticipant.getTrackPublication(this.lk.Track.Source.Camera),
    );
  }

  private screenShare(): ScreenShareSnapshot | null {
    for (const p of this.room.remoteParticipants.values()) {
      const video = this.subscribedVideo(
        p.getTrackPublication(this.lk.Track.Source.ScreenShare),
      );
      if (video) return { from: p.identity, fromName: p.name || p.identity, video };
    }
    const local = this.subscribedVideo(
      this.room.localParticipant.getTrackPublication(this.lk.Track.Source.ScreenShare),
    );
    if (local) {
      const me = this.room.localParticipant;
      return { from: me.identity, fromName: me.name || me.identity, video: local };
    }
    return null;
  }

  private playAudio(track: Track): void {
    if (!this.audioBox) {
      this.audioBox = document.createElement("div");
      this.audioBox.style.display = "none";
      this.audioBox.setAttribute("aria-hidden", "true");
      document.body.appendChild(this.audioBox);
    }
    const el = track.attach();
    this.audioBox.appendChild(el);
    this.audioElements.set(track, [...(this.audioElements.get(track) ?? []), el]);
  }

  private dropAudio(track: Track): void {
    for (const el of this.audioElements.get(track) ?? []) el.remove();
    this.audioElements.delete(track);
  }
}

/**
 * Connects a real LiveKit room. v2 never captures devices on connect: the
 * store enables the microphone explicitly afterwards, so a denial joins
 * listen-only instead of failing the join.
 */
export const createLiveRoom: RoomFactory = async (url, token) => {
  const lk = await sdk();
  const room = new lk.Room();
  const call = new LiveCallRoom(room, lk);
  call.wire();
  await room.connect(url, token);
  return call;
};
