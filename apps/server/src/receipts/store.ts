import type { AuthClaims, Receipt, ReceiptQuery } from "@office/shared";
import type { Repo } from "../db/repo.js";
import { composeReceipts } from "./compose.js";

/**
 * Receipts (ARCHITECTURE.md 12.10, P6-R): one decided change each, composed from the
 * existing `Repo` reads (audit rows, changes, meetings, people), so no table and no write
 * path.
 */
export interface ReceiptStore {
  list(claims: AuthClaims, query: ReceiptQuery): Promise<Receipt[]>;
}

export function createReceiptStore(repo: Repo): ReceiptStore {
  return {
    list: (claims, query) => composeReceipts(repo, claims, query),
  };
}
