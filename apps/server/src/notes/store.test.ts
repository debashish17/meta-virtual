import { WORKSPACE_ID, type AuthClaims } from "@office/shared";
import { describe, expect, it } from "vitest";
import { NotFoundError } from "../db/repo.js";
import { createInMemoryNoteStore } from "./store.js";

const MAYA: AuthClaims = { userId: "dev-maya", name: "Maya", workspaceId: WORKSPACE_ID };
const ARJUN: AuthClaims = { userId: "dev-arjun", name: "Arjun", workspaceId: WORKSPACE_ID };
const FOREIGN: AuthClaims = { userId: "dev-maya", name: "Maya", workspaceId: "other-workspace" };

const BUY_MILK = { text: "Buy milk", color: "yellow" };

describe("in-memory note store", () => {
  it("creates a note stamped with the author, undone", async () => {
    const store = createInMemoryNoteStore();
    const note = await store.create(MAYA, BUY_MILK);
    expect(note).toMatchObject({
      workspaceId: WORKSPACE_ID,
      userId: "dev-maya",
      text: "Buy milk",
      color: "yellow",
      done: false,
    });
    expect(note.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("lists only the caller's own notes", async () => {
    const store = createInMemoryNoteStore();
    const mayas = await store.create(MAYA, BUY_MILK);
    await store.create(ARJUN, { text: "Call Acme", color: "pink" });
    await store.create(FOREIGN, { text: "Elsewhere", color: "blue" });

    const mine = await store.list(MAYA);
    expect(mine.map((note) => note.id)).toEqual([mayas.id]);
    await expect(store.list(ARJUN)).resolves.toHaveLength(1);
    await expect(store.list(FOREIGN)).resolves.toHaveLength(1);
  });

  it("updates the caller's own note, field by field", async () => {
    const store = createInMemoryNoteStore();
    const note = await store.create(MAYA, BUY_MILK);
    const ticked = await store.update(MAYA, note.id, { done: true });
    expect(ticked).toMatchObject({ id: note.id, text: "Buy milk", color: "yellow", done: true });
    const edited = await store.update(MAYA, note.id, { text: "Buy oat milk", color: "green" });
    expect(edited).toMatchObject({
      id: note.id,
      text: "Buy oat milk",
      color: "green",
      done: true,
    });
  });

  it("refuses to change another author's note, without leaking it", async () => {
    const store = createInMemoryNoteStore();
    const mayas = await store.create(MAYA, BUY_MILK);
    await expect(store.update(ARJUN, mayas.id, { done: true })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      store.update(MAYA, "00000000-0000-4000-8000-000000000000", { done: true }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(store.list(MAYA)).resolves.toMatchObject([
      { id: mayas.id, text: "Buy milk", done: false },
    ]);
  });

  it("deletes the caller's own note only", async () => {
    const store = createInMemoryNoteStore();
    const mayas = await store.create(MAYA, BUY_MILK);
    const arjuns = await store.create(ARJUN, { text: "Call Acme", color: "pink" });
    await expect(store.remove(ARJUN, mayas.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(store.remove(MAYA, arjuns.id)).rejects.toBeInstanceOf(NotFoundError);
    await store.remove(MAYA, mayas.id);
    await expect(store.list(MAYA)).resolves.toHaveLength(0);
    await expect(store.list(ARJUN)).resolves.toHaveLength(1);
  });
});
