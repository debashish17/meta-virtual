// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useNet } from "../net/store.js";
import { useMe } from "../office/me.js";
import OfficeLifeBar from "./OfficeLifeBar.js";

afterEach(cleanup);

beforeEach(() => {
  useNet.setState({ status: "offline", selfId: null, players: {}, npcs: {}, chat: [] });
  useMe.setState({ name: "Maya" });
});

function onlineAs(status: string): void {
  useNet.setState({
    status: "online",
    selfId: "s1",
    players: { s1: { id: "s1", userId: "dev-maya", name: "Maya", status } as never },
    npcs: {},
    chat: [],
  });
}

describe("OfficeLifeBar", () => {
  it("offers Check in offline and walks home on click", () => {
    render(<OfficeLifeBar />);
    fireEvent.click(screen.getByRole("button", { name: "Check in" }));
    expect(screen.queryByTestId("office-life-bar")).toBeNull();
  });

  it("hides offline without a home desk", () => {
    useMe.setState({ name: "Zed" });
    render(<OfficeLifeBar />);
    expect(screen.queryByTestId("office-life-bar")).toBeNull();
  });

  it("shows Check in after joining", () => {
    onlineAs("available");
    render(<OfficeLifeBar />);
    expect(screen.getByRole("button", { name: "Check in" })).toBeTruthy();
  });

  it("shows Take a break while working", () => {
    onlineAs("working");
    render(<OfficeLifeBar />);
    expect(screen.getByText("Working")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Take a break" })).toBeTruthy();
  });

  it("says In a meeting with Back to work, never Available, while in a meeting", () => {
    onlineAs("in_meeting");
    render(<OfficeLifeBar />);
    expect(screen.getByText("In a meeting")).toBeTruthy();
    expect(screen.queryByText("Available")).toBeNull();
    expect(screen.getByRole("button", { name: "Back to work" })).toBeTruthy();
  });

  it("says Away with Check in while away", () => {
    onlineAs("away");
    render(<OfficeLifeBar />);
    expect(screen.getByText("Away")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check in" })).toBeTruthy();
  });

  it("shows Back to work on a break", () => {
    onlineAs("on_break");
    render(<OfficeLifeBar />);
    expect(screen.getByText("On a break")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to work" })).toBeTruthy();
  });
});
