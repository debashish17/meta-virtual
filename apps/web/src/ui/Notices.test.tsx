// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

afterEach(cleanup);

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

/**
 * Notices reads `VITE_API` at module level, so every test stubs the env first
 * and then imports Notices fresh — and takes the net store from that same
 * fresh module graph, or the online flag would land in a stale store.
 */
async function renderNotices() {
  const { useNet } = await import("../net/store.js");
  useNet.setState({ status: "online", selfId: "self", players: {}, npcs: {}, chat: [] });
  const { default: Notices } = await import("./Notices.js");
  render(<Notices loadError={null} onRetry={() => undefined} />);
}

function healthFetch(llm: string) {
  return vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, version: "test", authMode: "dev", llm }) }));
}

/**
 * The fixture pills (P4-B task 3): mock-api mode shows "Demo data"; http mode
 * against a server without a key shows "Fixture AI" once online; http mode
 * against a live model shows neither.
 */
describe("Notices", () => {
  it("shows Demo data in mock mode", async () => {
    vi.stubEnv("VITE_API", "mock");
    await renderNotices();
    expect(screen.getByText("Demo data")).toBeTruthy();
    expect(screen.queryByText("Fixture AI")).toBeNull();
  });

  it("shows Fixture AI on http once the server reports the fixture LLM", async () => {
    vi.stubEnv("VITE_API", "http");
    vi.stubGlobal("fetch", healthFetch("fixture"));
    await renderNotices();
    await waitFor(() => expect(screen.getByText("Fixture AI")).toBeTruthy());
    expect(screen.queryByText("Demo data")).toBeNull();
  });

  it("shows no fixture pill on http against a live model", async () => {
    vi.stubEnv("VITE_API", "http");
    vi.stubGlobal("fetch", healthFetch("meta"));
    await renderNotices();
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(screen.queryByText("Fixture AI")).toBeNull();
    expect(screen.queryByText("Demo data")).toBeNull();
  });

  it("stays quiet when /health cannot be reached", async () => {
    vi.stubEnv("VITE_API", "http");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    await renderNotices();
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(screen.queryByText("Fixture AI")).toBeNull();
  });
});
