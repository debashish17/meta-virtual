import { WORKSPACE_ID, type AuthClaims } from "@office/shared";
import { describe, expect, it } from "vitest";
import { NotFoundError } from "../db/repo.js";
import { BoardForbiddenError, createInMemoryBoardStore } from "./store.js";

const MAYA: AuthClaims = { userId: "dev-maya", name: "Maya", workspaceId: WORKSPACE_ID };
const ARJUN: AuthClaims = { userId: "dev-arjun", name: "Arjun", workspaceId: WORKSPACE_ID };
const FOREIGN: AuthClaims = { userId: "dev-maya", name: "Maya", workspaceId: "other-workspace" };

const SHIP_IT = { text: "Ship it", color: "pink" };
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

describe("in-memory board store", () => {
  it("pins a note stamped with the author", async () => {
    const store = createInMemoryBoardStore();
    const pin = await store.create(MAYA, SHIP_IT);
    expect(pin).toMatchObject({
      workspaceId: WORKSPACE_ID,
      authorId: "dev-maya",
      authorName: "Maya",
      text: "Ship it",
      color: "pink",
    });
    expect(pin.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("lists the whole workspace's pins, oldest first", async () => {
    const store = createInMemoryBoardStore();
    const first = await store.create(MAYA, SHIP_IT);
    const second = await store.create(ARJUN, { text: "Demo on Friday", color: "yellow" });
    await store.create(FOREIGN, { text: "Elsewhere", color: "blue" });

    const pins = await store.list(MAYA);
    expect(pins.map((pin) => pin.id)).toEqual([first.id, second.id]);
    await expect(store.list(ARJUN)).resolves.toHaveLength(2);
    await expect(store.list(FOREIGN)).resolves.toHaveLength(1);
  });

  it("lets the author remove their pin", async () => {
    const store = createInMemoryBoardStore();
    const pin = await store.create(MAYA, SHIP_IT);
    await store.remove(MAYA, pin.id);
    await expect(store.list(MAYA)).resolves.toHaveLength(0);
  });

  it("refuses another author's pin, and unknown pins read as missing", async () => {
    const store = createInMemoryBoardStore();
    const mayas = await store.create(MAYA, SHIP_IT);
    await expect(store.remove(ARJUN, mayas.id)).rejects.toBeInstanceOf(BoardForbiddenError);
    await expect(store.remove(MAYA, mayas.id)).resolves.toBeUndefined();
    await expect(store.remove(MAYA, UNKNOWN_ID)).rejects.toBeInstanceOf(NotFoundError);
    await expect(store.remove(FOREIGN, mayas.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
