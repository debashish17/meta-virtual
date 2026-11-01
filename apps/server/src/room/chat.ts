import type { ChatMessage } from "@office/shared";

/**
 * The room's chat history (ARCHITECTURE.md 12.2): every message the room broadcasts is kept
 * here, and a joining client receives the recent ones as `chat_history`.
 */
export interface ChatStore {
  add(message: ChatMessage): void;
  recent(limit?: number): ChatMessage[];
}

export class InMemoryChatStore implements ChatStore {
  private readonly messages: ChatMessage[] = [];

  constructor(private readonly cap = 200) {}

  add(message: ChatMessage): void {
    this.messages.push(message);
    if (this.messages.length > this.cap) {
      this.messages.splice(0, this.messages.length - this.cap);
    }
  }

  recent(limit = 50): ChatMessage[] {
    return this.messages.slice(-limit);
  }
}
