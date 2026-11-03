import { describe, expect, it } from "vitest";
import { SNAP_DISTANCE, type Pose } from "@office/shared";
import {
  ArrivalPacer,
  SnapshotBuffer,
  toNpcView,
  toPlayerView,
  type RawNpcState,
  type RawPlayerState,
} from "./interp";

function rawPlayer(over: Partial<RawPlayerState> = {}): RawPlayerState {
  return {
    id: "s1",
    userId: "u1",
    name: "Maya",
    look: { body: "ch13", top: "#fff", accent: "#fff", bottom: "#fff", shoes: "#000", height: 1.7 },
    x: 1,
    z: 2,
    facing: 0,
    pose: "walk",
    speed: 2.3,
    activity: { kind: "", targetId: "" },
    status: "available",
    zoneId: "",
    lastSeq: 9,
    ...over,
  };
}

describe("toPlayerView / toNpcView", () => {
  it("maps the wire sentinels back to null", () => {
    const view = toPlayerView(rawPlayer());
    expect(view.activity).toBeNull();
    expect(view.zoneId).toBeNull();
    expect(view.pose).toBe("walk");
    expect(view.status).toBe("available");
  });

  it("keeps a real activity and zone", () => {
    const view = toPlayerView(
      rawPlayer({ activity: { kind: "seat", targetId: "seat:1,2" }, zoneId: "team_a" }),
    );
    expect(view.activity).toEqual({ kind: "seat", targetId: "seat:1,2" });
    expect(view.zoneId).toBe("team_a");
  });

  it("maps npcs", () => {
    const raw: RawNpcState = {
      id: "n1",
      name: "Kenji",
      look: rawPlayer().look,
      x: 3,
      z: 4,
      facing: 1,
      pose: "type",
      speed: 0,
    };
    expect(toNpcView(raw)).toEqual({ ...raw, pose: "type" });
  });
});

describe("SnapshotBuffer", () => {
  const snap = (t: number, x: number, pose: Pose = "walk") => ({
    t,
    x,
    z: 0,
    facing: 0,
    pose,
    speed: 2.3,
  });

  it("returns null with no snapshots and holds a single one", () => {
    const buf = new SnapshotBuffer();
    expect(buf.sample(1000)).toBeNull();
    buf.push(snap(900, 5, "stand"));
    const s = buf.sample(1000)!;
    expect(s.x).toBe(5);
    expect(s.pose).toBe("stand");
    expect(s.snapped).toBe(true);
  });

  it("interpolates the midpoint and steps the pose with the snapshot", () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(0, 0, "walk"));
    buf.push(snap(200, 0.2, "stand"));
    // INTERP_DELAY_MS is 100: sampling at 200 looks at t=100, halfway.
    const s = buf.sample(200)!;
    expect(s.x).toBeCloseTo(0.1, 6);
    expect(s.pose).toBe("stand");
    expect(s.snapped).toBe(false);
  });

  it("snaps on jumps above SNAP_DISTANCE instead of sliding", () => {
    expect(SNAP_DISTANCE).toBe(0.3);
    const buf = new SnapshotBuffer();
    buf.push(snap(0, 0, "walk"));
    buf.push(snap(200, 1.5, "sit_down"));
    const s = buf.sample(200)!;
    expect(s.x).toBe(1.5);
    expect(s.pose).toBe("sit_down");
    expect(s.snapped).toBe(true);
  });

  it("interpolates facing the short way round", () => {
    const buf = new SnapshotBuffer();
    buf.push({ t: 0, x: 0, z: 0, facing: 3.0, pose: "walk", speed: 1 });
    buf.push({ t: 200, x: 0.1, z: 0, facing: -3.0, pose: "walk", speed: 1 });
    const s = buf.sample(200)!;
    expect(s.facing).toBeCloseTo(Math.PI, 5);
  });

  it("holds the latest snapshot when the sample time runs past it", () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(0, 1));
    buf.push(snap(100, 1.1));
    expect(buf.sample(5000)!.x).toBe(1.1);
  });

  it("ignores out-of-order snapshots", () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(200, 2));
    buf.push(snap(100, 99));
    expect(buf.latest!.x).toBe(2);
  });
});

describe("ArrivalPacer", () => {
  it("spaces snapshots one tick apart when a coarse server timer makes them arrive unevenly", () => {
    // A 20 Hz server on Windows' 15.625 ms timer grid sends after gaps of 62.5 and
    // 46.875 ms (mean 50). Interpolating on arrival times would pulse the walking speed.
    const pacer = new ArrivalPacer(50);
    const gaps = [62.5, 46.875, 46.875, 46.875, 46.875];
    const arrivals: number[] = [];
    const stamps: number[] = [];
    let at = 1000;
    for (let i = 0; i < 60; i += 1) {
      arrivals.push(at);
      stamps.push(pacer.stamp(at));
      at += gaps[i % gaps.length];
    }
    for (let i = 20; i < stamps.length; i += 1) {
      const spacing = stamps[i] - stamps[i - 1];
      expect(spacing).toBeGreaterThan(48);
      expect(spacing).toBeLessThan(52);
      expect(Math.abs(stamps[i] - arrivals[i])).toBeLessThan(15);
    }
  });

  it("starts afresh after a gap (the person stood still)", () => {
    const pacer = new ArrivalPacer(50);
    expect(pacer.stamp(0)).toBe(0);
    expect(pacer.stamp(50)).toBeCloseTo(50, 9);
    expect(pacer.stamp(1000)).toBe(1000);
  });

  it("keeps stamps in order and at most one tick ahead when snapshots bunch up", () => {
    const pacer = new ArrivalPacer(50);
    let last = pacer.stamp(0);
    for (let i = 0; i < 6; i += 1) {
      const t = pacer.stamp(10); // a burst, all arriving together
      expect(t).toBeGreaterThanOrEqual(last);
      expect(t).toBeLessThanOrEqual(10 + 50);
      last = t;
    }
  });
});
