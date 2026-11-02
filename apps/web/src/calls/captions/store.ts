import { create } from "zustand";
import { Caption, SERVER_MESSAGE } from "@office/shared";
import type { CaptionSegment } from "./assembly.js";

/** The live caption list (interim included); the finals feed "End meeting". */
export const CAPTIONS_MAX = 50;
/** Mirrors the server buffer cap so the client's assembly matches the room's. */
export const FINALS_MAX = 500;

export type ReceivedCaption = Caption;

interface CaptionState {
  captions: ReceivedCaption[];
  finals: CaptionSegment[];
  pushCaption(caption: ReceivedCaption): void;
  clearCaptions(): void;
}

export const useCaptions = create<CaptionState>()((set) => ({
  captions: [],
  finals: [],

  pushCaption: (caption) =>
    set((state) => {
      const captions = [...state.captions, caption].slice(-CAPTIONS_MAX);
      if (!caption.final) return { captions };
      const finals = [...state.finals, { name: caption.name, text: caption.text, ts: caption.ts }];
      return { captions, finals: finals.slice(-FINALS_MAX) };
    }),

  clearCaptions: () => set({ captions: [], finals: [] }),
}));

/** The room surface the binding needs; the office room satisfies it structurally. */
export interface CaptionListenerRoom {
  onMessage(type: string, callback: (message: unknown) => void): void;
}

/**
 * Collect the room's `caption` broadcasts into the store (P5-B's connection calls this
 * on join — see report R2). Malformed broadcasts are dropped, never rendered.
 */
export function bindCaptionRoom(room: CaptionListenerRoom): void {
  room.onMessage(SERVER_MESSAGE.caption, (message: unknown) => {
    const parsed = Caption.safeParse(message);
    if (!parsed.success) return;
    useCaptions.getState().pushCaption(parsed.data);
  });
}

/** The final segments "End meeting" assembles, in arrival order. */
export function finalSegments(): CaptionSegment[] {
  return useCaptions.getState().finals;
}

/** Clear the live list and the finals (a meeting was posted, or the call ended). */
export function clearCaptions(): void {
  useCaptions.getState().clearCaptions();
}
