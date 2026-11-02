import { describe, expect, it } from "vitest";
import { isCallableZone, zoneName } from "./zones.js";

describe("isCallableZone", () => {
  it("accepts the meeting, customer and project rooms", () => {
    expect(isCallableZone("meeting_a")).toBe(true);
    expect(isCallableZone("meeting_b")).toBe(true);
    expect(isCallableZone("boardroom")).toBe(true);
    expect(isCallableZone("pod_1")).toBe(true);
    expect(isCallableZone("focus_1")).toBe(true);
    expect(isCallableZone("huddle_1")).toBe(true);
    expect(isCallableZone("acme_room")).toBe(true);
    expect(isCallableZone("project_room")).toBe(true);
  });

  it("rejects open floor, the kitchen and unknown zones", () => {
    expect(isCallableZone(null)).toBe(false);
    expect(isCallableZone("")).toBe(false);
    expect(isCallableZone("no_such_zone")).toBe(false);
  });

  it("rejects zones whose type is not a room", () => {
    // Every zone in the office is either callable or explicitly not.
    expect(isCallableZone("cafe")).toBe(false);
  });
});

describe("zoneName", () => {
  it("names known zones and falls back to the id", () => {
    expect(zoneName("acme_room")).toBe("Acme room");
    expect(zoneName("project_room")).toBe("Project room");
    expect(zoneName("no_such_zone")).toBe("no_such_zone");
    expect(zoneName(null)).toBe("a meeting room");
  });
});
