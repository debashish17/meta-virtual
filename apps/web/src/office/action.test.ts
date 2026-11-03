import { describe, expect, it } from "vitest";
import { COUNTERS, DESK_SEATS, startActivity, type Activity, type Target } from "@office/shared";
import { actionFor, describeAction, phaseOffline, phaseOnline } from "./action";

const seat: Target = { kind: "seat", id: DESK_SEATS[0].id, seat: DESK_SEATS[0] };
const counter: Target = { kind: "counter", id: COUNTERS[0].id, spot: COUNTERS[0] };
const seatTarget = seat as Extract<Target, { kind: "seat" }>;

describe("actionFor", () => {
  it("offers to sit at a free chair within reach, and marks it", () => {
    expect(actionFor({ phase: "free", near: seat })).toEqual({ kind: "sit", at: { x: DESK_SEATS[0].x, z: DESK_SEATS[0].z } });
  });

  it("offers a drink at the counter", () => {
    expect(actionFor({ phase: "free", near: counter })).toEqual({ kind: "drink", at: { x: COUNTERS[0].x, z: COUNTERS[0].z } });
  });

  it("offers nothing with nothing near", () => {
    expect(actionFor({ phase: "free", near: null })).toBeNull();
  });

  it("lets you call off the walk there, stand up once seated, and says what is happening in between", () => {
    expect(actionFor({ phase: "going", near: null })).toEqual({ kind: "cancel" });
    expect(actionFor({ phase: "sitting_down", near: null })).toEqual({ kind: "busy", label: "Sitting down" });
    expect(actionFor({ phase: "seated", near: null })).toEqual({ kind: "stand" });
    expect(actionFor({ phase: "standing_up", near: null })).toEqual({ kind: "busy", label: "Standing up" });
    expect(actionFor({ phase: "at_counter", near: null })).toEqual({ kind: "step_away" });
  });
});

describe("describeAction", () => {
  it("puts E on everything you can do, and nothing on what is under way", () => {
    expect(describeAction({ kind: "sit", at: { x: 0, z: 0 } })).toEqual({ key: "E", label: "Sit down" });
    expect(describeAction({ kind: "drink", at: { x: 0, z: 0 } })).toEqual({ key: "E", label: "Get a drink" });
    expect(describeAction({ kind: "cancel" })).toEqual({ key: "E", label: "Cancel" });
    expect(describeAction({ kind: "stand" })).toEqual({ key: "E", label: "Stand up" });
    expect(describeAction({ kind: "step_away" })).toEqual({ key: "E", label: "Step away" });
    expect(describeAction({ kind: "busy", label: "Standing up" })).toEqual({ key: null, label: "Standing up…" });
  });
});

describe("phaseOffline", () => {
  const at = (a: Activity, pending = false) => phaseOffline(a, pending);
  it("maps the activity to what you are doing", () => {
    expect(at({ kind: "free" })).toBe("free");
    expect(at({ kind: "free" }, true)).toBe("going");
    expect(at(startActivity(seat))).toBe("sitting_down"); // stepping round beside the chair
    expect(at({ kind: "sitting_down", target: seatTarget, left: 1 })).toBe("sitting_down");
    expect(at({ kind: "swivelling", target: seatTarget, left: 0.5, to: "desk" })).toBe("sitting_down");
    expect(at({ kind: "seated", target: seatTarget })).toBe("seated");
    expect(at({ kind: "swivelling", target: seatTarget, left: 0.5, to: "side" })).toBe("standing_up");
    expect(at({ kind: "standing_up", target: seatTarget, left: 1 })).toBe("standing_up");
    expect(at({ kind: "leaving", target: seatTarget, i: 0, wait: 0 })).toBe("standing_up");
    expect(at(startActivity(counter))).toBe("at_counter");
  });
});

describe("phaseOnline", () => {
  it("maps the room's view of you to what you are doing", () => {
    expect(phaseOnline("free", null, "stand")).toBe("free");
    expect(phaseOnline("approach", null, "walk")).toBe("going");
    expect(phaseOnline("activity", "seat", "walk")).toBe("sitting_down");   // round the chair
    expect(phaseOnline("activity", "seat", "sit_down")).toBe("sitting_down");
    expect(phaseOnline("activity", "seat", "seated")).toBe("sitting_down"); // swivelling to the desk
    expect(phaseOnline("activity", "seat", "type")).toBe("seated");
    expect(phaseOnline("activity", "seat", "sit_talk")).toBe("seated");
    expect(phaseOnline("leaving", "seat", "stand_up")).toBe("standing_up");
    expect(phaseOnline("activity", "counter", "interact")).toBe("at_counter");
  });
});
