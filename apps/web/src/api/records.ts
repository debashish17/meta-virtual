import { create } from "zustand";
import { DEMO_ACCOUNT, DEMO_PROJECT } from "@office/shared";
import type {
  AccountStatus,
  Meeting,
  MyDay,
  ProjectStatus,
  ProposedChange,
  RecordKind,
} from "@office/shared";
import { api } from "./index.js";

interface RecordsState {
  myDay: MyDay | null;
  pending: ProposedChange[];
  project: ProjectStatus | null;
  account: AccountStatus | null;
  /** The meeting behind the current pending list, or null when nothing is pending. */
  meeting: Meeting | null;
  load(): Promise<void>;
  refetch(kinds: RecordKind[]): Promise<void>;
}

async function loadMeetingFor(pending: ProposedChange[]): Promise<Meeting | null> {
  if (pending.length === 0) {
    return null;
  }
  try {
    return await api.meeting(pending[0].sourceMeetingId);
  } catch {
    return null;
  }
}

export type RecordsChangedHandler = () => void;

const changedListeners = new Map<RecordKind, Set<RecordsChangedHandler>>();

/**
 * Phase 6: subscribe to `records_changed` for one query kind (ARCHITECTURE.md 12.10). The
 * feature stores (bookings, board, receipts) refetch through this; every kind's listeners
 * run even when this store has nothing of its own to refetch for it. Returns an
 * unsubscribe function. A throwing listener is reported and skipped, never breaking the
 * others.
 */
export function onRecordsChanged(kind: RecordKind, fn: RecordsChangedHandler): () => void {
  let set = changedListeners.get(kind);
  if (!set) {
    set = new Set();
    changedListeners.set(kind, set);
  }
  set.add(fn);
  return () => {
    changedListeners.get(kind)?.delete(fn);
  };
}

function notifyChanged(kinds: RecordKind[]): void {
  for (const kind of kinds) {
    for (const fn of changedListeners.get(kind) ?? []) {
      try {
        fn();
      } catch (err) {
        console.warn(
          `[records] listener for ${kind} failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }
}

/**
 * What the panels and wall displays show (ARCHITECTURE.md 12.6). The net store calls
 * `refetch` on `records_changed` (P2-B wires that); no query library, the client stack is
 * locked to Zustand.
 */
export const useRecords = create<RecordsState>()((set) => ({
  myDay: null,
  pending: [],
  project: null,
  account: null,
  meeting: null,

  load: async () => {
    const [myDay, pending, project, account] = await Promise.all([
      api.myDay(),
      api.listPending(),
      api.projectStatus(DEMO_PROJECT.id),
      api.accountStatus(DEMO_ACCOUNT.id),
    ]);
    set({ myDay, pending, project, account, meeting: await loadMeetingFor(pending) });
  },

  refetch: async (kinds) => {
    if (kinds.includes("proposed_changes") || kinds.includes("meetings")) {
      const pending = await api.listPending();
      set({ pending, meeting: await loadMeetingFor(pending) });
    }
    if (kinds.some((k) => k === "tasks" || k === "milestones" || k === "commitments")) {
      const [myDay, project, account] = await Promise.all([
        api.myDay(),
        api.projectStatus(DEMO_PROJECT.id),
        api.accountStatus(DEMO_ACCOUNT.id),
      ]);
      set({ myDay, project, account });
    }
    notifyChanged(kinds);
  },
}));
