import type { AuthClaims, BoardPin, BoardPinCreate } from "@office/shared";

/**
 * Company-board pins (ARCHITECTURE.md 12.10, P6-D): workspace-visible, drawn on the cork
 * board, `records_changed { kinds: ["board"] }` on every write. P6-0 slot: the interface
 * and an empty in-memory store; P6-D adds the Postgres implementation and the migration
 * (workspace read, author-only delete).
 */
export interface BoardStore {
  list(claims: AuthClaims): Promise<BoardPin[]>;
  create(claims: AuthClaims, input: BoardPinCreate): Promise<BoardPin>;
  remove(claims: AuthClaims, id: string): Promise<void>;
}

const TODO = "the board is not implemented yet (P6-D)";

export function createInMemoryBoardStore(): BoardStore {
  return {
    list: () => Promise.resolve([]),
    create: () => Promise.reject(new Error(TODO)),
    remove: () => Promise.reject(new Error(TODO)),
  };
}
