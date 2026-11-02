import type { AuthClaims, ChatMessage } from "@office/shared";
import type { MembershipLookup } from "../auth/supabase.js";
import type { Repo } from "../db/repo.js";
import { InMemoryChatStore, type ChatStore } from "../room/chat.js";

/**
 * The database chat store (`deps.chat`): every message the room would
 * broadcast is kept in memory for `recent` and written through to
 * `chat_messages` (the `Repo` persists it; the room wiring that hands this
 * store to the room is a lead Request). Writes are fire-and-forget so the
 * sync `ChatStore` shape holds; `flush` awaits them for tests and shutdown.
 * Failures call `onError` with the error message only, never the chat text.
 */
export class DatabaseChatStore implements ChatStore {
  private readonly memory: InMemoryChatStore;
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly repo: Repo,
    private readonly lookup: MembershipLookup,
    cap = 200,
    private readonly onError: (message: string) => void = (message) =>
      console.warn(`[chat] ${message}`),
  ) {
    this.memory = new InMemoryChatStore(cap);
  }

  add(message: ChatMessage): void {
    this.memory.add(message);
    const run = this.persist(message).catch((error: unknown) => {
      this.onError(
        `persist failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    });
    this.pending = this.pending.then(() => run);
  }

  recent(limit?: number): ChatMessage[] {
    return this.memory.recent(limit);
  }

  /** Resolves once every `add` so far has reached the database (or failed). */
  async flush(): Promise<void> {
    await this.pending;
  }

  private async persist(message: ChatMessage): Promise<void> {
    const membership = await this.lookup(message.userId);
    if (!membership) {
      return;
    }
    const claims: AuthClaims = {
      userId: message.userId,
      name: message.name,
      workspaceId: membership.workspaceId,
    };
    await this.repo.saveChat(claims, { name: message.name, text: message.text });
  }
}
