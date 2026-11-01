// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ZONES } from "@office/shared";
import { useNet } from "../net/store.js";
import { useOfficeUi } from "../office/state.js";
import Panels from "./Panels.js";

afterEach(cleanup);

beforeEach(() => {
  useNet.setState({ status: "offline", selfId: null, players: {}, npcs: {}, chat: [] });
  useOfficeUi.getState().setZone(null);
});

const ACME_ROOM = ZONES.find((z) => z.id === "acme_room")!;

describe("Panels", () => {
  it("renders every panel with the mock records", async () => {
    render(<Panels />);
    expect(screen.getByLabelText("Participants")).toBeTruthy();
    expect(screen.getByLabelText("Chat")).toBeTruthy();
    expect(screen.getByLabelText("Ask the office")).toBeTruthy();
    expect(screen.getByText("Demo data")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Fix webhook signature validation")).toBeTruthy());
  });

  it("collapses and reopens panels", async () => {
    render(<Panels />);
    await waitFor(() => expect(screen.getByLabelText("My day")).toBeTruthy());
    const chat = screen.getByLabelText("Chat");
    fireEvent.click(
      chat.querySelector(".pan-collapse") ?? screen.getByLabelText("Collapse panel"),
    );
    expect(screen.getByRole("button", { name: "Open chat" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open chat" }));
    expect(screen.getByLabelText("Chat")).toBeTruthy();
  });

  it("shows Process meeting only in the Acme room and opens approvals", async () => {
    render(<Panels />);
    await waitFor(() => expect(screen.getByLabelText("My day")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Process meeting" })).toBeNull();
    useOfficeUi.getState().setZone(ACME_ROOM);
    const process = await screen.findByRole("button", { name: "Process meeting" });
    fireEvent.click(process);
    expect((process as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Approvals (4)" })).toBeTruthy());
    useOfficeUi.getState().setZone(null);
    await waitFor(() => expect(screen.queryByRole("button", { name: /Process/ })).toBeNull());
  });

  it("swallows movement keydowns in panels but never keyups", async () => {
    render(<Panels />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "People" })).toBeTruthy());
    const seen: string[] = [];
    const down = (e: KeyboardEvent) => seen.push(`down:${e.code}`);
    const up = (e: KeyboardEvent) => seen.push(`up:${e.code}`);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    try {
      const ask = screen.getByLabelText("Your question");
      fireEvent.keyDown(ask, { code: "KeyW" });
      fireEvent.keyUp(ask, { code: "KeyW" });
      fireEvent.keyDown(ask, { code: "Enter" });
      expect(seen).toEqual(["up:KeyW", "down:Enter"]);
    } finally {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    }
  });

  it("keeps chat and presence single-player while offline", async () => {
    render(<Panels />);
    expect(screen.getByText("Join the server to chat.")).toBeTruthy();
    expect((screen.getByLabelText("Chat message") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Your status") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText(/\(you\)/)).toBeTruthy();
  });
});
