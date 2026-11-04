import { useEffect } from "react";
import { create } from "zustand";
import type { BoardPin } from "@office/shared";
import { boardApi, type BoardApi } from "../api/board.js";
import { onRecordsChanged } from "../api/records.js";

/**
 * The company board on the web (ARCHITECTURE.md 12.10, P6-D): pins read
 * through `useBoard`, the overlay opens through `useBoardUi` (from a click on
 * the cork board or the ideas wall). The list refetches live on
 * `records_changed board`, so a pin shows in the other browser with no
 * refresh. A failed load (the server restarting) keeps the last pins instead
 * of blanking the board.
 */

interface BoardState {
  pins: BoardPin[];
  load(api: BoardApi): Promise<BoardPin[]>;
}

export const useBoardStore = create<BoardState>()((set) => ({
  pins: [],
  load: async (api) => {
    const pins = await api.list();
    set({ pins });
    return pins;
  },
}));

export function useBoard(api: BoardApi = boardApi): BoardPin[] {
  const pins = useBoardStore((state) => state.pins);
  useEffect(() => {
    let live = true;
    const reload = (): void => {
      if (live) {
        void useBoardStore.getState().load(api).catch(() => undefined);
      }
    };
    reload();
    const off = onRecordsChanged("board", reload);
    return () => {
      live = false;
      off();
    };
  }, [api]);
  return pins;
}

interface BoardUiState {
  open: boolean;
  setOpen(open: boolean): void;
}

export const useBoardUi = create<BoardUiState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
