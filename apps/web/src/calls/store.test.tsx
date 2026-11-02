// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { waitFor } from "@testing-library/react";
import { DEFAULT_LOOK, type PlayerView, type Status } from "@office/shared";
import { useNet } from "../net/store.js";
import { MockRoom } from "./mockRoom.js";
import {
  debugAddPeer,
  debugPeerScreen,
  debugRemovePeer,
  resetCallsForTests,
  setRoomFactory,
  setTokenDeps,
  startCallWatcher,
  useCalls,
} from "./store.js";

function selfPlayer(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    id: "self",
    userId: "user-maya",
    name: "Maya",
    look: DEFAULT_LOOK,
    x: 15,
    z: 3,
    facing: 0,
    pose: "stand",
    speed: 0,
    activity: null,
    status: "available",
    zoneId: null,
    lastSeq: 0,
    ...overrides,
  };
}

let statusSent: Status[];
let rooms: MockRoom[];

function goOnline(self: PlayerView): void {
  useNet.setState({
    status: "online",
    selfId: self.id,
    players: { [self.id]: self },
    npcs: {},
    chat: [],
    send: {
      chat: () => undefined,
      // Records the send and echoes it into the snapshot, like the server does.
      status: ((s: Status) => {
        statusSent.push(s);
        const net = useNet.getState();
        const current = net.selfId ? net.players[net.selfId] : undefined;
        if (net.selfId && current) {
          useNet.setState({
            players: { ...net.players, [net.selfId]: { ...current, status: s } },
          });
        }
      }) as (s: Status) => void,
    },
  });
}

function moveSelfTo(zoneId: string | null, status?: Status): void {
  const net = useNet.getState();
  const self = net.selfId ? net.players[net.selfId] : undefined;
  if (!net.selfId || !self) throw new Error("not online in test");
  useNet.setState({
    players: { ...net.players, [net.selfId]: { ...self, zoneId, ...(status ? { status } : {}) } },
  });
}

function tokenOk(): void {
  setTokenDeps({
    baseUrl: "http://server:2567",
    getToken: async () => "dev:Maya",
    fetchFn: (async () =>
      new Response(JSON.stringify({ url: "mock://livekit", token: "mock-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch,
  });
}

function armMockRoom(): void {
  setRoomFactory(async (url, token) => {
    const room = new MockRoom({ localIdentity: "user-maya", localName: "Maya" });
    rooms.push(room);
    await room.connect(url, token);
    return room;
  });
}

beforeEach(() => {
  statusSent = [];
  rooms = [];
  resetCallsForTests();
  useNet.setState({ status: "offline", selfId: null, players: {}, npcs: {}, chat: [] });
  armMockRoom();
  tokenOk();
  startCallWatcher();
});

afterEach(() => {
  resetCallsForTests();
  useNet.setState({ status: "offline", selfId: null, players: {}, npcs: {}, chat: [] });
  vi.restoreAllMocks();
});

describe("join and leave follow the avatar", () => {
  it("joins when the net-store zone becomes a meeting room", async () => {
    goOnline(selfPlayer({ zoneId: null }));
    expect(useCalls.getState().phase).toBe("idle");

    moveSelfTo("acme_room");
    await waitFor(() => expect(useCalls.getState().phase).toBe("live"));
    expect(rooms).toHaveLength(1);
    expect(rooms[0].connected).toBe(true);
    expect(useCalls.getState().zoneId).toBe("acme_room");
    expect(useCalls.getState().micOn).toBe(true);
    expect(useCalls.getState().listenOnly).toBe(false);
    expect(statusSent).toEqual(["in_meeting"]);
  });

  it("leaves when the avatar walks out, restoring the previous status", async () => {
    goOnline(selfPlayer({ zoneId: "acme_room", status: "away" }));
    await waitFor(() => expect(useCalls.getState().phase).toBe("live"));
    expect(statusSent).toEqual(["in_meeting"]);

    moveSelfTo(null);
    await waitFor(() => expect(useCalls.getState().phase).toBe("idle"));
    expect(rooms[0].connected).toBe(false);
    expect(statusSent).toEqual(["in_meeting", "away"]);
  });

  it("does not join the café, the open plan or unknown zones", async () => {
    goOnline(selfPlayer({ zoneId: null }));
    for (const zone of ["cafe", "library", "no_such_zone"]) {
      moveSelfTo(zone);
      await waitFor(() => expect(useCalls.getState().phase).toBe("idle"));
    }
    expect(rooms).toHaveLength(0);
    expect(statusSent).toHaveLength(0);
  });

  it("does not join while offline", async () => {
    useNet.setState({
      status: "offline",
      selfId: "self",
      players: { self: selfPlayer({ zoneId: "acme_room" }) },
      npcs: {},
      chat: [],
    });
    await waitFor(() => expect(useCalls.getState().phase).toBe("idle"));
    expect(rooms).toHaveLength(0);
  });

  it("keeps the call across a reconnect blip, and leaves on a hard offline", async () => {
    goOnline(selfPlayer({ zoneId: "acme_room" }));
    await waitFor(() => expect(useCalls.getState().phase).toBe("live"));
    useNet.setState({ status: "reconnecting" });
    await waitFor(() => expect(useCalls.getState().phase).toBe("live"));
    expect(rooms[0].connected).toBe(true);
    useNet.setState({ status: "online" });
    await waitFor(() => expect(useCalls.getState().phase).toBe("live"));

    useNet.setState({ status: "offline", selfId: null, players: {} });
    await waitFor(() => expect(useCalls.getState().phase).toBe("idle"));
    expect(rooms[0].connected).toBe(false);
  });

  it("moves the call when the avatar walks from one room into another", async () => {
    goOnline(selfPlayer({ zoneId: "acme_room" }));
    await waitFor(() => expect(useCalls.getState().phase).toBe("live"));
    moveSelfTo("project_room");
    await waitFor(() => expect(useCalls.getState().zoneId).toBe("project_room"));
    await waitFor(() => expect(useCalls.getState().phase).toBe("live"));
    expect(rooms).toHaveLength(2);
    expect(rooms[0].connected).toBe(false);
    expect(rooms[1].connected).toBe(true);
  });

  it("ignores a join that resolves after the avatar already left", async () => {
    let release!: (value: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    setTokenDeps({
      baseUrl: "http://server:2567",
      getToken: async () => "dev:Maya",
      fetchFn: (() => gate) as unknown as typeof fetch,
    });
    goOnline(selfPlayer({ zoneId: null }));
    moveSelfTo("acme_room");
    await waitFor(() => expect(useCalls.getState().phase).toBe("joining"));
    moveSelfTo(null);
    await waitFor(() => expect(useCalls.getState().phase).toBe("idle"));
    release(
      new Response(JSON.stringify({ url: "mock://livekit", token: "mock-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    // Let the stale continuation run: it must change nothing.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(rooms).toHaveLength(0);
    expect(useCalls.getState().phase).toBe("idle");
    expect(statusSent).toHaveLength(0);
  });
});

describe("unavailable calls", () => {
  it("shows Calls unavailable on 503 calls_off and retries on re-entry", async () => {
    setTokenDeps({
      baseUrl: "http://server:2567",
      getToken: async () => "dev:Maya",
      fetchFn: (async () =>
        new Response(JSON.stringify({ error: "calls_off", message: "calls are off" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch,
    });
    goOnline(selfPlayer({ zoneId: null }));
    moveSelfTo("acme_room");
    await waitFor(() => expect(useCalls.getState().phase).toBe("unavailable"));
    expect(useCalls.getState().notice).toBe("Calls unavailable");
    expect(rooms).toHaveLength(0);
    expect(statusSent).toHaveLength(0);

    moveSelfTo(null);
    await waitFor(() => expect(useCalls.getState().phase).toBe("idle"));
    expect(useCalls.getState().notice).toBeNull();
  });

  it("shows Calls unavailable when the room cannot connect", async () => {
    setRoomFactory(async () => {
      throw new Error("unreachable");
    });
    goOnline(selfPlayer({ zoneId: "acme_room" }));
    await waitFor(() => expect(useCalls.getState().phase).toBe("unavailable"));
    expect(useCalls.getState().notice).toBe("Calls unavailable");
    expect(statusSent).toHaveLength(0);
  });

  it("shows Calls unavailable on an unexpected disconnect", async () => {
    goOnline(selfPlayer({ zoneId: "acme_room" }));
    await waitFor(() => expect(useCalls.getState().phase).toBe("live"));
    rooms[0].drop();
    await waitFor(() => expect(useCalls.getState().phase).toBe("unavailable"));
    expect(useCalls.getState().notice).toBe("Calls unavailable");
  });

  it("dismissing suppresses retries until the avatar leaves and returns", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "calls_off", message: "calls are off" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
    );
    setTokenDeps({
      baseUrl: "http://server:2567",
      getToken: async () => "dev:Maya",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    goOnline(selfPlayer({ zoneId: null }));
    moveSelfTo("acme_room");
    await waitFor(() => expect(useCalls.getState().phase).toBe("unavailable"));
    expect(fetchFn).toHaveBeenCalledTimes(1);

    useCalls.getState().dismiss();
    expect(useCalls.getState().phase).toBe("idle");
    // Still in the room: no rejoin without leaving first.
    moveSelfTo("acme_room");
    await waitFor(() => expect(useCalls.getState().phase).toBe("idle"));
    expect(fetchFn).toHaveBeenCalledTimes(1);

    moveSelfTo(null);
    moveSelfTo("acme_room");
    await waitFor(() => expect(useCalls.getState().phase).toBe("unavailable"));
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe("listen-only", () => {
  function denyMic(): void {
    setRoomFactory(async (url, token) => {
      const room = new MockRoom({
        localIdentity: "user-maya",
        localName: "Maya",
        acquireAudio: async () => {
          throw new DOMException("Permission denied", "NotAllowedError");
        },
      });
      rooms.push(room);
      await room.connect(url, token);
      return room;
    });
  }

  it("joins listen-only with a notice when the microphone is denied", async () => {
    denyMic();
    goOnline(selfPlayer({ zoneId: "acme_room" }));
    await waitFor(() => expect(useCalls.getState().phase).toBe("live"));
    const state = useCalls.getState();
    expect(state.listenOnly).toBe(true);
    expect(state.micOn).toBe(false);
    expect(state.notice).toBe("Microphone unavailable — you're listening only.");
    expect(statusSent).toEqual(["in_meeting"]);
  });

  it("stays listen-only when unmute is denied again, and recovers when allowed", async () => {
    let denied = true;
    setRoomFactory(async (url, token) => {
      const room = new MockRoom({
        localIdentity: "user-maya",
        localName: "Maya",
        acquireAudio: async () => {
          if (denied) throw new DOMException("Permission denied", "NotAllowedError");
        },
      });
      rooms.push(room);
      await room.connect(url, token);
      return room;
    });
    goOnline(selfPlayer({ zoneId: "acme_room" }));
    await waitFor(() => expect(useCalls.getState().listenOnly).toBe(true));

    await useCalls.getState().toggleMute();
    expect(useCalls.getState().listenOnly).toBe(true);
    expect(useCalls.getState().notice).toBe("Microphone unavailable — you're listening only.");

    denied = false;
    await useCalls.getState().toggleMute();
    expect(useCalls.getState().listenOnly).toBe(false);
    expect(useCalls.getState().micOn).toBe(true);
    expect(useCalls.getState().notice).toBeNull();
  });
});

describe("manual leave and the call bar", () => {
  it("leave suppresses auto-rejoin until the avatar leaves and returns", async () => {
    goOnline(selfPlayer({ zoneId: "acme_room" }));
    await waitFor(() => expect(useCalls.getState().phase).toBe("live"));
    useCalls.getState().leaveCall();
    await waitFor(() => expect(useCalls.getState().phase).toBe("idle"));
    expect(rooms[0].connected).toBe(false);
    expect(statusSent).toEqual(["in_meeting", "available"]);

    // Still in the room: no rejoin.
    moveSelfTo("acme_room");
    await waitFor(() => expect(useCalls.getState().phase).toBe("idle"));
    expect(rooms).toHaveLength(1);

    moveSelfTo(null);
    moveSelfTo("acme_room");
    await waitFor(() => expect(useCalls.getState().phase).toBe("live"));
    expect(rooms).toHaveLength(2);
  });

  it("does not clobber a status the user changed mid-call", async () => {
    goOnline(selfPlayer({ zoneId: "acme_room" }));
    await waitFor(() => expect(useCalls.getState().phase).toBe("live"));
    moveSelfTo("acme_room", "away");
    moveSelfTo(null);
    await waitFor(() => expect(useCalls.getState().phase).toBe("idle"));
    expect(statusSent).toEqual(["in_meeting"]);
  });

  it("toggles camera and screen share through the room", async () => {
    goOnline(selfPlayer({ zoneId: "acme_room" }));
    await waitFor(() => expect(useCalls.getState().phase).toBe("live"));

    await useCalls.getState().toggleCamera();
    expect(useCalls.getState().camOn).toBe(true);
    expect(rooms[0].cameraEnabled).toBe(true);
    await waitFor(() => expect(useCalls.getState().selfCamera).not.toBeNull());

    await useCalls.getState().toggleShare();
    expect(useCalls.getState().sharing).toBe(true);
    await waitFor(() => expect(useCalls.getState().screen?.fromName).toBe("Maya"));

    await useCalls.getState().toggleShare();
    expect(useCalls.getState().sharing).toBe(false);
    await waitFor(() => expect(useCalls.getState().screen).toBeNull());

    await useCalls.getState().toggleCamera();
    expect(useCalls.getState().camOn).toBe(false);
    await waitFor(() => expect(useCalls.getState().selfCamera).toBeNull());
  });
});

describe("participants", () => {
  it("tracks remote peers and their cameras", async () => {
    goOnline(selfPlayer({ zoneId: "acme_room" }));
    await waitFor(() => expect(useCalls.getState().phase).toBe("live"));

    debugAddPeer("user-arjun", "Arjun", { camera: true });
    await waitFor(() => expect(useCalls.getState().peers).toHaveLength(1));
    expect(useCalls.getState().peers[0].name).toBe("Arjun");
    expect(useCalls.getState().peers[0].camera).not.toBeNull();
    expect(useCalls.getState().peers[0].micMuted).toBe(false);

    debugPeerScreen("user-arjun");
    await waitFor(() => expect(useCalls.getState().screen?.fromName).toBe("Arjun"));

    debugPeerScreen(null);
    await waitFor(() => expect(useCalls.getState().screen).toBeNull());

    debugRemovePeer("user-arjun");
    await waitFor(() => expect(useCalls.getState().peers).toHaveLength(0));
  });

  it("peer helpers are silent without a mock room", () => {
    resetCallsForTests();
    expect(() => debugAddPeer("u", "U", {})).not.toThrow();
    expect(() => debugRemovePeer("u")).not.toThrow();
    expect(() => debugPeerScreen("u")).not.toThrow();
  });
});

describe("call watcher", () => {
  it("joins a room the avatar is already in when the watcher starts", async () => {
    resetCallsForTests();
    goOnline(selfPlayer({ zoneId: "meeting_b" }));
    armMockRoom();
    tokenOk();
    startCallWatcher();
    await waitFor(() => expect(useCalls.getState().phase).toBe("live"));
    expect(useCalls.getState().zoneId).toBe("meeting_b");
  });

  it("startCallWatcher is idempotent", async () => {
    const fetchFn = vi.fn(
      (async () =>
        new Response(JSON.stringify({ url: "mock://livekit", token: "mock-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })) as Mock,
    );
    setTokenDeps({
      baseUrl: "http://server:2567",
      getToken: async () => "dev:Maya",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    startCallWatcher();
    startCallWatcher();
    goOnline(selfPlayer({ zoneId: "acme_room" }));
    await waitFor(() => expect(useCalls.getState().phase).toBe("live"));
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
