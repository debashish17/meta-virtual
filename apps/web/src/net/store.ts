import { create } from "zustand";
import type { ChatMessage, NpcView, PlayerView, Status } from "@office/shared";

export type NetStatus = "offline" | "connecting" | "online" | "reconnecting";

export interface NetStore {
  status: NetStatus;
  selfId: string | null;
  players: Record<string, PlayerView>;
  npcs: Record<string, NpcView>;
  chat: ChatMessage[];
  send: {
    chat(text: string): void;
    status(status: Status): void;
  };
}

/**
 * The multiplayer contract on the web side. P2-B fills in the connection, prediction and
 * reconciliation behind this shape (it owns this file except the shape); until then the
 * office stays single-player and `send` is a no-op.
 */
export const useNet = create<NetStore>()(() => ({
  status: "offline",
  selfId: null,
  players: {},
  npcs: {},
  chat: [],
  send: {
    chat: () => undefined,
    status: () => undefined,
  },
}));
