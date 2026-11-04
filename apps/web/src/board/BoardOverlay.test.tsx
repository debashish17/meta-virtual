// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMockBoardApi, type BoardApi } from "../api/board.js";
import { useMe } from "../office/me.js";
import BoardOverlay, { BOARD_COLORS } from "./BoardOverlay.js";
import { useBoardStore, useBoardUi } from "./store.js";

afterEach(() => {
  cleanup();
  useBoardStore.setState({ pins: [] });
  useBoardUi.setState({ open: false });
});

const pink = BOARD_COLORS.find((color) => color.name === "pink")!.value;

function openBoard(api: BoardApi) {
  act(() => useBoardUi.setState({ open: true }));
  render(<BoardOverlay deps={{ api }} />);
}

describe("BoardOverlay", () => {
  it("stays closed until the cork board or ideas wall opens it", () => {
    render(<BoardOverlay deps={{ api: createMockBoardApi() }} />);
    expect(screen.queryByTestId("board-overlay")).toBeNull();
    act(() => useBoardUi.getState().setOpen(true));
    expect(screen.getByTestId("board-overlay")).toBeTruthy();
  });

  it("shows an empty state, then pins in the chosen colour", async () => {
    const api = createMockBoardApi();
    openBoard(api);
    expect(await screen.findByText("No pins yet. The whole workspace sees what you pin.")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "pink" }));
    fireEvent.change(screen.getByLabelText("New pin"), { target: { value: "Ship it" } });
    fireEvent.click(screen.getByRole("button", { name: "Pin it" }));

    await waitFor(() => expect(screen.getByText("Ship it")).toBeTruthy());
    const stored = await api.list();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ text: "Ship it", color: pink });
    expect(screen.getByText("Ship it").closest("li")!.style.background).toBeTruthy();
    expect(screen.queryByText("No pins yet. The whole workspace sees what you pin.")).toBeNull();
  });

  it("needs some text before it pins", async () => {
    openBoard(createMockBoardApi());
    await screen.findByTestId("board-overlay");
    const pin = screen.getByRole("button", { name: "Pin it" }) as HTMLButtonElement;
    expect(pin.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("New pin"), { target: { value: "   " } });
    expect(pin.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("New pin"), { target: { value: "Ship it" } });
    expect(pin.disabled).toBe(false);
  });

  it("only offers Remove on your own pins, and removes them", async () => {
    const api = createMockBoardApi();
    const me = useMe.getState().name;
    await api.create({ text: "Mine", color: pink });
    act(() => useMe.setState({ name: "Someone else" }));
    await api.create({ text: "Theirs", color: pink });
    act(() => useMe.setState({ name: me }));
    try {
      openBoard(api);
      await waitFor(() => expect(screen.getByText("Theirs")).toBeTruthy());
      expect(screen.getByText("Mine")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Remove: Theirs" })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Remove: Mine" }));
      await waitFor(() => expect(screen.queryByText("Mine")).toBeNull());
      expect(screen.getByText("Theirs")).toBeTruthy();
      expect(await api.list()).toHaveLength(1);
    } finally {
      act(() => useMe.setState({ name: me }));
    }
  });

  it("closes on the backdrop, the button and Escape", async () => {
    openBoard(createMockBoardApi());
    await screen.findByTestId("board-overlay");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("board-overlay")).toBeNull();

    act(() => useBoardUi.getState().setOpen(true));
    await screen.findByTestId("board-overlay");
    fireEvent.click(screen.getByTestId("board-overlay").parentElement!);
    expect(screen.queryByTestId("board-overlay")).toBeNull();

    act(() => useBoardUi.getState().setOpen(true));
    await screen.findByTestId("board-overlay");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("board-overlay")).toBeNull();
  });
});
