// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { netSend, onMeetingInvite } from "./connection.js";

describe("meeting invites", () => {
  it("subscribes and unsubscribes without a room", () => {
    const off = onMeetingInvite(() => undefined);
    expect(typeof off).toBe("function");
    off();
    off();
  });

  it("goTo is a no-op without a room", () => {
    expect(() => netSend.goTo("desk")).not.toThrow();
    expect(() => netSend.goTo("break")).not.toThrow();
  });
});
