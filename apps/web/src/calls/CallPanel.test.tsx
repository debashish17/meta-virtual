// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DEFAULT_LOOK, type PlayerView, type Status } from "@office/shared";
import { useNet } from "../net/store.js";
import CallPanel, { type CallsDebugHook } from "./CallPanel.js";
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

function goOnline(self: PlayerView): void {
  useNet.setState({
    status: "online",
    selfId: self.id,
    players: { [self.id]: self },
    npcs: {},
    chat: [],
    send: {
      chat: () => undefined,
      status: (s: Status) => {
        const net = useNet.getState();
        const current = net.selfId ? net.players[net.selfId] : undefined;
        if (net.selfId && current) {
          useNet.setState({
            players: { ...net.players, [net.selfId]: { ...current, status: s } },
          });
        }
      },
    },
  });
}

function moveSelfTo(zoneId: string | null): void {
  const net = useNet.getState();
  const self = net.selfId ? net.players[net.selfId] : undefined;
  if (!net.selfId || !self) throw new Error("not online in test");
  useNet.setState({
    players: { ...net.players, [net.selfId]: { ...self, zoneId } },
  });
}

beforeEach(() => {
  resetCallsForTests();
  useNet.setState({ status: "offline", selfId: null, players: {}, npcs: {}, chat: [] });
  setRoomFactory(async (url, token) => {
    const room = new MockRoom({ localIdentity: "user-maya", localName: "Maya" });
    await room.connect(url, token);
    return room;
  });
  setTokenDeps({
    baseUrl: "http://server:2567",
    getToken: async () => "dev:Maya",
    fetchFn: (async () =>
      new Response(JSON.stringify({ url: "mock://livekit", token: "mock-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch,
  });
  startCallWatcher();
});

afterEach(() => {
  cleanup();
  resetCallsForTests();
  useNet.setState({ status: "offline", selfId: null, players: {}, npcs: {}, chat: [] });
  delete (window as unknown as Record<string, unknown>).__callsDebug;
});

async function joinLive(): Promise<void> {
  render(<CallPanel />);
  goOnline(selfPlayer({ zoneId: null }));
  moveSelfTo("acme_room");
  await waitFor(() => expect(useCalls.getState().phase).toBe("live"));
  await waitFor(() => expect(screen.queryByTestId("call-panel")).toBeTruthy());
}

describe("CallPanel", () => {
  it("renders nothing when idle", () => {
    render(<CallPanel />);
    expect(screen.queryByTestId("call-panel")).toBeNull();
  });

  it("shows the joining state with the room name", () => {
    render(<CallPanel />);
    act(() => {
      useCalls.setState({ phase: "joining", zoneId: "acme_room" });
    });
    expect(screen.getByTestId("call-panel")).toBeTruthy();
    expect(screen.getByText("Acme room")).toBeTruthy();
    expect(screen.getByText("Joining the call…")).toBeTruthy();
  });

  it("shows Calls unavailable with a dismiss button", () => {
    render(<CallPanel />);
    act(() => {
      useCalls.setState({ phase: "unavailable", zoneId: "acme_room", notice: "Calls unavailable" });
    });
    expect(screen.getByText("Calls unavailable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("call-panel")).toBeNull();
    expect(useCalls.getState().phase).toBe("idle");
  });

  it("joins through the mocked room: bar, tiles and leave", async () => {
    await joinLive();
    expect(screen.getByText("Acme room")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mute" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Camera" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Leave" })).toBeTruthy();

    debugAddPeer("user-arjun", "Arjun", { camera: true });
    await waitFor(() => expect(screen.queryByText("Arjun")).toBeTruthy());
    const tile = screen.getByTestId("call-tile-user-arjun");
    expect(tile.querySelector("video")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Camera" }));
    await waitFor(() => expect(screen.queryByText("You")).toBeTruthy());

    debugRemovePeer("user-arjun");
    await waitFor(() => expect(screen.queryByText("Arjun")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(screen.queryByTestId("call-panel")).toBeNull());
    expect(useCalls.getState().phase).toBe("idle");
  });

  it("shows a screen-share tile while a peer shares", async () => {
    await joinLive();
    debugAddPeer("user-arjun", "Arjun", {});
    debugPeerScreen("user-arjun");
    await waitFor(() => expect(screen.queryByText("Arjun's screen")).toBeTruthy());
    debugPeerScreen(null);
    await waitFor(() => expect(screen.queryByText("Arjun's screen")).toBeNull());
  });

  it("stays usable listen-only: the notice shows and nothing is blocked", async () => {
    await joinLive();
    act(() => {
      useCalls.setState({
        listenOnly: true,
        micOn: false,
        notice: "Microphone unavailable — you're listening only.",
      });
    });
    expect(screen.getByTestId("call-notice")).toBeTruthy();
    expect(screen.getByText("Microphone unavailable — you're listening only.")).toBeTruthy();
    for (const name of ["Unmute", "Camera", "Share", "Leave"]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    }
  });

  it("collapses to a tab and reopens", async () => {
    await joinLive();
    fireEvent.click(screen.getByRole("button", { name: "Collapse call panel" }));
    expect(screen.queryByTestId("call-panel")).toBeNull();
    const tab = screen.getByRole("button", { name: "Open call panel" });
    expect(tab).toBeTruthy();
    fireEvent.click(tab);
    await waitFor(() => expect(screen.queryByTestId("call-panel")).toBeTruthy());
  });

  it("installs the DEV debug hook while mounted", () => {
    expect(
      (window as unknown as { __callsDebug?: CallsDebugHook }).__callsDebug,
    ).toBeUndefined();
    const { unmount } = render(<CallPanel />);
    const hook = (window as unknown as { __callsDebug?: CallsDebugHook }).__callsDebug;
    expect(hook).toBeTruthy();
    expect(hook?.state().phase).toBe("idle");
    unmount();
    expect(
      (window as unknown as { __callsDebug?: CallsDebugHook }).__callsDebug,
    ).toBeUndefined();
  });
});
