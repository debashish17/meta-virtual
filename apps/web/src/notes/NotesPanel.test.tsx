// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMockNotesApi, type NotesApi } from "../api/notes.js";
import NotesPanel, { NOTE_COLORS } from "./NotesPanel.js";

afterEach(cleanup);

beforeEach(() => {
  NOTE_COLORS satisfies readonly { name: string; value: string }[];
});

const pink = NOTE_COLORS.find((color) => color.name === "pink")!.value;
const yellow = NOTE_COLORS.find((color) => color.name === "yellow")!.value;

describe("NotesPanel", () => {
  it("shows an empty state, then adds a note in the chosen colour", async () => {
    const api = createMockNotesApi();
    render(<NotesPanel deps={{ api }} />);
    expect(await screen.findByText("No notes yet. They stay private to you.")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "pink" }));
    fireEvent.change(screen.getByLabelText("New note"), { target: { value: "Buy milk" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    await waitFor(() => expect(screen.getByText("Buy milk")).toBeTruthy());
    const stored = await api.list();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ text: "Buy milk", color: pink, done: false });
    const card = screen.getByText("Buy milk").closest("li")!;
    expect(card.style.background).toBeTruthy();
    expect(screen.queryByText("No notes yet. They stay private to you.")).toBeNull();
  });

  it("needs some text before it adds", async () => {
    render(<NotesPanel deps={{ api: createMockNotesApi() }} />);
    await screen.findByTestId("notes-panel");
    const add = screen.getByRole("button", { name: "Add note" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("New note"), { target: { value: "   " } });
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("New note"), { target: { value: "Buy milk" } });
    expect(add.disabled).toBe(false);
  });

  it("lists existing notes and ticks them done and back", async () => {
    const api: NotesApi = createMockNotesApi();
    await api.create({ text: "Buy milk", color: yellow });
    render(<NotesPanel deps={{ api }} />);
    await waitFor(() => expect(screen.getByText("Buy milk")).toBeTruthy());

    fireEvent.click(screen.getByRole("checkbox", { name: "Mark done: Buy milk" }));
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Mark not done: Buy milk" })).toBeTruthy(),
    );
    expect((await api.list())[0]?.done).toBe(true);
    expect(screen.getByText("Buy milk").closest("li")!.className).toContain("done");

    fireEvent.click(screen.getByRole("checkbox", { name: "Mark not done: Buy milk" }));
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Mark done: Buy milk" })).toBeTruthy(),
    );
    expect((await api.list())[0]?.done).toBe(false);
  });

  it("edits text and colour, and cancels without changing", async () => {
    const api: NotesApi = createMockNotesApi();
    await api.create({ text: "Buy milk", color: yellow });
    render(<NotesPanel deps={{ api }} />);
    await waitFor(() => expect(screen.getByText("Buy milk")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Edit: Buy milk" }));
    fireEvent.change(screen.getByLabelText("Edit note"), { target: { value: "Buy oat milk" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect((await api.list())[0]).toMatchObject({ text: "Buy milk", color: yellow });

    fireEvent.click(screen.getByRole("button", { name: "Edit: Buy milk" }));
    fireEvent.change(screen.getByLabelText("Edit note"), { target: { value: "Buy oat milk" } });
    const editor = screen.getByLabelText("Edit note").closest("li")!;
    fireEvent.click(within(editor).getByRole("radio", { name: "green" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("Buy oat milk")).toBeTruthy());
    const green = NOTE_COLORS.find((color) => color.name === "green")!.value;
    expect((await api.list())[0]).toMatchObject({ text: "Buy oat milk", color: green });
  });

  it("deletes a note", async () => {
    const api: NotesApi = createMockNotesApi();
    await api.create({ text: "Buy milk", color: yellow });
    render(<NotesPanel deps={{ api }} />);
    await waitFor(() => expect(screen.getByText("Buy milk")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Delete: Buy milk" }));
    await waitFor(() => expect(screen.queryByText("Buy milk")).toBeNull());
    expect(await api.list()).toHaveLength(0);
  });

  it("keeps the last list when a write fails", async () => {
    const api: NotesApi = createMockNotesApi();
    await api.create({ text: "Buy milk", color: yellow });
    render(<NotesPanel deps={{ api }} />);
    await waitFor(() => expect(screen.getByText("Buy milk")).toBeTruthy());

    const failing: NotesApi = {
      list: () => api.list(),
      create: (input) => api.create(input),
      update: (id, input) => api.update(id, input),
      remove: () => Promise.reject(new Error("the server is restarting")),
    };
    cleanup();
    render(<NotesPanel deps={{ api: failing }} />);
    await waitFor(() => expect(screen.getByText("Buy milk")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Delete: Buy milk" }));
    await waitFor(() => expect(screen.getByText("the server is restarting")).toBeTruthy());
    expect(screen.getByText("Buy milk")).toBeTruthy();
  });
});
