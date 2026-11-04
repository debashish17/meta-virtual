import { randomUUID } from "node:crypto";
import {
  BoardPin,
  type AuthClaims,
  type BoardPin as BoardPinData,
  type BoardPinCreate,
} from "@office/shared";
import { NotFoundError } from "../db/repo.js";

/**
 * Company-board pins (ARCHITECTURE.md 12.10, P6-D): workspace-visible, drawn on the cork
 * board, `records_changed { kinds: ["board"] }` on every write (sent by the routes).
 * Anyone in the workspace lists and pins; only the author deletes (a 403, like ending
 * someone else's booking: the pin is visible to everyone, so its existence does not leak).
 */
export interface BoardStore {
  list(claims: AuthClaims): Promise<BoardPinData[]>;
  create(claims: AuthClaims, input: BoardPinCreate): Promise<BoardPinData>;
  remove(claims: AuthClaims, id: string): Promise<void>;
}

/** Removing someone else's pin: the routes answer 403. */
export class BoardForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoardForbiddenError";
  }
}

export function createInMemoryBoardStore(): BoardStore {
  const pins = new Map<string, BoardPinData>();

  return {
    async list(claims: AuthClaims): Promise<BoardPinData[]> {
      return structuredClone(
        [...pins.values()]
          .filter((pin) => pin.workspaceId === claims.workspaceId)
          .sort((a, b) => a.createdAt - b.createdAt),
      );
    },

    async create(claims: AuthClaims, input: BoardPinCreate): Promise<BoardPinData> {
      const pin = BoardPin.parse({
        id: randomUUID(),
        workspaceId: claims.workspaceId,
        authorId: claims.userId,
        authorName: claims.name,
        text: input.text,
        color: input.color,
        createdAt: Date.now(),
      });
      pins.set(pin.id, pin);
      return structuredClone(pin);
    },

    async remove(claims: AuthClaims, id: string): Promise<void> {
      const pin = pins.get(id);
      if (!pin || pin.workspaceId !== claims.workspaceId) {
        throw new NotFoundError(`unknown pin ${id}`);
      }
      if (pin.authorId !== claims.userId) {
        throw new BoardForbiddenError(`only ${pin.authorName} can remove this pin`);
      }
      pins.delete(id);
    },
  };
}
