// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  LIVE_SHARE_SCREENS,
  LiveShareOverlay,
  liveShareFor,
  sharePlacementForCall,
} from "../office/displays/LiveShare.js";
import { MockVideo } from "./mockRoom.js";

afterEach(cleanup);

describe("liveShareFor", () => {
  it("maps the two TV rooms to WallDisplays' placements", () => {
    expect(LIVE_SHARE_SCREENS).toHaveLength(2);
    // Same geometry as WallDisplays' screens (x 13.7 / 27.5, north wall z 0.1),
    // nudged a touch toward the viewer so the share plane never z-fights the TV.
    expect(liveShareFor("acme_room")).toEqual({
      zoneId: "acme_room",
      title: "Acme room",
      position: [13.7, 1.33, 0.218],
      size: [1.08, 0.675],
    });
    expect(liveShareFor("project_room")).toEqual({
      zoneId: "project_room",
      title: "Project room",
      position: [27.5, 1.405, 0.218],
      size: [1.34, 0.8375],
    });
  });

  it("has no TV for other zones", () => {
    expect(liveShareFor("meeting_a")).toBeNull();
    expect(liveShareFor("cafe")).toBeNull();
    expect(liveShareFor("no_such_zone")).toBeNull();
    expect(liveShareFor(null)).toBeNull();
  });
});

describe("sharePlacementForCall", () => {
  it("shows the share only while live, in a TV room, with a screen", () => {
    expect(sharePlacementForCall("live", "acme_room", true)?.zoneId).toBe("acme_room");
    expect(sharePlacementForCall("live", "project_room", true)?.zoneId).toBe("project_room");
    expect(sharePlacementForCall("live", "acme_room", false)).toBeNull();
    expect(sharePlacementForCall("live", "meeting_a", true)).toBeNull();
    expect(sharePlacementForCall("joining", "acme_room", true)).toBeNull();
    expect(sharePlacementForCall("unavailable", "acme_room", true)).toBeNull();
    expect(sharePlacementForCall("idle", null, false)).toBeNull();
  });
});

describe("LiveShareOverlay", () => {
  it("attaches the shared screen and closes on button, backdrop and Escape", () => {
    const onClose = vi.fn();
    render(
      <LiveShareOverlay
        title="Acme room"
        name="Arjun"
        video={new MockVideo("screen")}
        onClose={onClose}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Acme room screen share" });
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain("Arjun");
    const video = dialog.querySelector("video");
    expect(video).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(video?.isConnected).toBe(true);
  });
});
