import { useEffect } from "react";
import { create } from "zustand";
import type { Receipt, ReceiptQuery, RecordKind } from "@office/shared";
import { receiptsApi } from "../api/receipts.js";
import { onRecordsChanged } from "../api/records.js";

/**
 * Receipts on the web (ARCHITECTURE.md 12.10, P6-R): the drawer history, the wall displays
 * and the ask chips all read through `useReceipts`. There is no `receipts` record kind:
 * approvals already broadcast the kinds they touch, so every subscription below refetches
 * on those, and the second user sees a receipt live with no refresh.
 */

const RECEIPT_KINDS: RecordKind[] = [
  "tasks",
  "milestones",
  "commitments",
  "proposed_changes",
  "meetings",
];

/** The cache key for a receipts query: by value, so inline query objects do not refetch. */
export function receiptsKey(query: ReceiptQuery): string {
  return JSON.stringify({
    accountId: query.accountId ?? null,
    projectId: query.projectId ?? null,
    limit: query.limit ?? null,
  });
}

interface ReceiptsState {
  byKey: Record<string, Receipt[]>;
  load(query: ReceiptQuery): Promise<Receipt[]>;
}

export const useReceiptsStore = create<ReceiptsState>()((set) => ({
  byKey: {},
  load: async (query) => {
    const items = await receiptsApi.list(query);
    set((state) => ({ byKey: { ...state.byKey, [receiptsKey(query)]: items } }));
    return items;
  },
}));

/**
 * The receipts for one query, refetched live on `records_changed`. A failed load (the
 * server restarting) keeps the last receipts instead of blanking the walls and drawers.
 */
export function useReceipts(query: ReceiptQuery): Receipt[] {
  const key = receiptsKey(query);
  const items = useReceiptsStore((state) => state.byKey[key]);
  useEffect(() => {
    let live = true;
    const reload = (): void => {
      if (live) {
        void useReceiptsStore.getState().load(query).catch(() => undefined);
      }
    };
    reload();
    const offs = RECEIPT_KINDS.map((kind) => onRecordsChanged(kind, reload));
    return () => {
      live = false;
      for (const off of offs) {
        off();
      }
    };
    // The key carries the query by value; the object itself is intentionally not a dep.
  }, [key]);
  return items ?? [];
}
