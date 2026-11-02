import { beforeEach, describe, expect, it } from "vitest";
import {
  CAPTIONS_MAX,
  bindCaptionRoom,
  finalSegments,
  useCaptions,
} from "./store.js";

function feed(room: { handlers: Map<string, (message: unknown) => void> }, message: unknown): void {
  room.handlers.get("caption")?.(message);
}

describe("caption store", () => {
  beforeEach(() => {
    useCaptions.getState().clearCaptions();
  });

  it("collects broadcasts and keeps final-only segments for end of meeting", () => {
    const room = { handlers: new Map<string, (message: unknown) => void>() };
    bindCaptionRoom({ onMessage: (type, cb) => void room.handlers.set(type, cb) });

    feed(room, { name: "Maya", text: "moving go-", final: false, ts: 1 });
    feed(room, { name: "Maya", text: "moving go-live", final: true, ts: 2 });
    feed(room, { name: "Arjun", text: "i will take it", final: true, ts: 3 });

    const state = useCaptions.getState();
    expect(state.captions).toHaveLength(3);
    expect(state.captions[0]).toMatchObject({ name: "Maya", final: false });
    expect(finalSegments()).toEqual([
      { name: "Maya", text: "moving go-live", ts: 2 },
      { name: "Arjun", text: "i will take it", ts: 3 },
    ]);
  });

  it("drops malformed broadcasts without touching the store", () => {
    const room = { handlers: new Map<string, (message: unknown) => void>() };
    bindCaptionRoom({ onMessage: (type, cb) => void room.handlers.set(type, cb) });

    feed(room, { name: "", text: "no speaker", final: true, ts: 1 });
    feed(room, { text: "no name at all", final: true, ts: 2 });
    feed(room, "not an object");

    expect(useCaptions.getState().captions).toEqual([]);
    expect(finalSegments()).toEqual([]);
  });

  it("caps the live list at the newest captions", () => {
    const room = { handlers: new Map<string, (message: unknown) => void>() };
    bindCaptionRoom({ onMessage: (type, cb) => void room.handlers.set(type, cb) });

    for (let i = 0; i < CAPTIONS_MAX + 10; i += 1) {
      feed(room, { name: "Maya", text: `line ${i}`, final: false, ts: i });
    }
    const captions = useCaptions.getState().captions;
    expect(captions).toHaveLength(CAPTIONS_MAX);
    expect(captions[0].text).toBe("line 10");
    expect(captions[captions.length - 1].text).toBe(`line ${CAPTIONS_MAX + 9}`);
  });

  it("clears everything on demand", () => {
    useCaptions.getState().pushCaption({ name: "Maya", text: "hi", final: true, ts: 1 });
    useCaptions.getState().clearCaptions();
    expect(useCaptions.getState().captions).toEqual([]);
    expect(finalSegments()).toEqual([]);
  });
});
