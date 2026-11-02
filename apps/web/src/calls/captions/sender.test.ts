import { describe, expect, it, vi } from "vitest";
import { sendCaption } from "./sender.js";

describe("sendCaption", () => {
  it("sends trimmed text as caption_send with a timestamp", () => {
    const room = { send: vi.fn() };
    const before = Date.now();
    expect(sendCaption(room, "  moving go-live  ", true)).toBe(true);
    expect(room.send).toHaveBeenCalledTimes(1);
    const [type, payload] = room.send.mock.calls[0] as [string, Record<string, unknown>];
    expect(type).toBe("caption_send");
    expect(payload["text"]).toBe("moving go-live");
    expect(payload["final"]).toBe(true);
    expect(typeof payload["ts"]).toBe("number");
    expect((payload["ts"] as number) >= before).toBe(true);
  });

  it("sends interim segments as non-final", () => {
    const room = { send: vi.fn() };
    expect(sendCaption(room, "moving go-", false)).toBe(true);
    expect(room.send.mock.calls[0][1]).toMatchObject({ final: false });
  });

  it("drops blank text without touching the room", () => {
    const room = { send: vi.fn() };
    expect(sendCaption(room, "   ", true)).toBe(false);
    expect(room.send).not.toHaveBeenCalled();
  });
});
