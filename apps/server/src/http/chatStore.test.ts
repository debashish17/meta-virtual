import { WORKSPACE_ID } from "@office/shared";
import { describe, expect, it } from "vitest";
import type { WorkspaceMembership } from "../auth/supabase.js";
import { createInMemoryRepo } from "../db/repo.js";
import { DatabaseChatStore } from "./chatStore.js";

const MESSAGE = {
  id: "chat-1",
  userId: "maya",
  name: "Maya",
  text: "hello office",
  ts: 1_700_000_000_000,
};

function lookup(members: Record<string, WorkspaceMembership>) {
  return async (userId: string): Promise<WorkspaceMembership | null> =>
    members[userId] ?? null;
}

describe("DatabaseChatStore", () => {
  it("keeps messages in memory and writes them through to the repo", async () => {
    const repo = createInMemoryRepo();
    const store = new DatabaseChatStore(repo, lookup({ maya: { workspaceId: WORKSPACE_ID, name: "Maya" } }));
    store.add(MESSAGE);
    expect(store.recent()).toEqual([MESSAGE]);
    await store.flush();
    const claims = { userId: "maya", name: "Maya", workspaceId: WORKSPACE_ID };
    // The repo stamps its own id and ts on persist; the content must survive.
    await expect(repo.chat(claims)).resolves.toEqual([
      expect.objectContaining({ userId: "maya", name: "Maya", text: "hello office" }),
    ]);
  });

  it("keeps the message in memory when the sender has no workspace", async () => {
    const repo = createInMemoryRepo();
    const errors: string[] = [];
    const store = new DatabaseChatStore(repo, lookup({}), 200, (message) =>
      errors.push(message),
    );
    store.add(MESSAGE);
    await store.flush();
    expect(store.recent()).toEqual([MESSAGE]);
    const claims = { userId: "maya", name: "Maya", workspaceId: WORKSPACE_ID };
    await expect(repo.chat(claims)).resolves.toEqual([]);
    expect(errors).toEqual([]);
  });

  it("reports a persist failure without the chat text, and never throws", async () => {
    const repo = createInMemoryRepo();
    const errors: string[] = [];
    const store = new DatabaseChatStore(
      repo,
      async () => {
        throw new Error("db is down");
      },
      200,
      (message) => errors.push(message),
    );
    expect(() => store.add(MESSAGE)).not.toThrow();
    await store.flush();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("db is down");
    expect(errors[0]).not.toContain("hello office");
  });
});
