import { describe, expect, it } from "vitest";
import {
  OFFICE_WALK,
  SNAP_DISTANCE,
  TICK_DT,
  WORLD,
  spawnPlayer,
  stepPlayer,
  type StepInput,
} from "@office/shared";
import { Predictor, followSnapshot } from "./predict";

const INTENT: StepInput = { kind: "intent", dx: 1, dz: 0, run: false };

describe("Predictor", () => {
  it("applies no correction when the simulations agree (fake server lags 3 ticks)", () => {
    const spawn = { x: WORLD.spawn.x, z: WORLD.spawn.z };
    const client = new Predictor(spawn);
    const server = spawnPlayer(spawn);
    // The server retains the latest input it has received and re-applies it every tick,
    // exactly like the room; delivery lags 3 ticks behind the client.
    let retained: StepInput = { kind: "intent", dx: 0, dz: 0, run: false };
    let serverLastSeq = 0;
    const inFlight: { seq: number; input: StepInput; deliverAt: number }[] = [];
    // The join snapshot plants the predictor on the spawn before any input flows.
    client.reconcile({ x: spawn.x, z: spawn.z, facing: 0, lastSeq: 0 });
    let lastAcked = 0;

    for (let tick = 0; tick < 30; tick += 1) {
      const seq = client.nextSeq();
      client.tick(INTENT, seq);
      inFlight.push({ seq, input: INTENT, deliverAt: tick + 3 });
      for (const m of inFlight.splice(0)) {
        if (m.deliverAt <= tick) {
          retained = m.input;
          serverLastSeq = m.seq;
        } else {
          inFlight.push(m);
        }
      }
      stepPlayer(server, retained, TICK_DT);
      if (serverLastSeq !== lastAcked) {
        lastAcked = serverLastSeq;
        const outcome = client.reconcile({
          x: server.x,
          z: server.z,
          facing: server.facing,
          lastSeq: serverLastSeq,
        });
        expect(outcome).not.toBe("snap");
      }
      client.decay(TICK_DT);
    }
    // Deterministic on both sides: the error stays exactly zero, and the predicted
    // path equals a reference sim run with the same inputs (whatever the walls do).
    const reference = spawnPlayer(spawn);
    for (let i = 0; i < 30; i += 1) stepPlayer(reference, INTENT, TICK_DT);
    expect(client.pending()).toEqual({ x: 0, z: 0 });
    expect(client.pos()).toEqual({ x: client.sim.x, z: client.sim.z });
    expect(client.sim.x).toBe(reference.x);
    expect(client.sim.z).toBe(reference.z);
  });

  it("smooths a small error over about 100 ms instead of snapping", () => {
    const spawn = { x: WORLD.spawn.x, z: WORLD.spawn.z };
    const p = new Predictor(spawn);
    p.reconcile({ x: spawn.x, z: spawn.z, facing: 0, lastSeq: 0 }); // join snapshot
    const seq = p.nextSeq();
    p.tick(INTENT, seq);
    const pred = { x: p.sim.x, z: p.sim.z };
    const outcome = p.reconcile({ x: pred.x + 0.1, z: pred.z, facing: 0, lastSeq: seq });
    expect(outcome).toBe("smooth");
    expect(p.pending().x).toBeCloseTo(0.1, 9);
    expect(p.pos().x).toBeCloseTo(pred.x + 0.1, 9);
    p.decay(0.05); // half the correction time: about half the error left
    expect(p.pending().x).toBeCloseTo(0.05, 2);
    for (let i = 0; i < 20; i += 1) p.decay(0.05);
    expect(p.pending()).toEqual({ x: 0, z: 0 });
  });

  it("snaps when the server rejects a move", () => {
    const spawn = { x: WORLD.spawn.x, z: WORLD.spawn.z };
    const target = OFFICE_WALK.nearestWalkable(
      { x: spawn.x + 4, z: spawn.z - 4 },
      3,
    ) ?? { x: spawn.x, z: spawn.z };
    const p = new Predictor(spawn);
    p.reconcile({ x: spawn.x, z: spawn.z, facing: 0, lastSeq: 0 }); // join snapshot
    // Five agreed intents, then a target the server rejects (it stays put and never
    // advances lastSeq for it), then one more intent the server does apply.
    for (let i = 0; i < 5; i += 1) p.tick(INTENT, p.nextSeq());
    const agreed = { x: p.sim.x, z: p.sim.z };
    p.tick({ kind: "target", x: target.x, z: target.z }, p.nextSeq());
    for (let i = 0; i < 10; i += 1) p.tick(null); // follow the route, unsent
    expect(Math.hypot(p.sim.x - agreed.x, p.sim.z - agreed.z)).toBeGreaterThan(SNAP_DISTANCE);
    const seq = p.nextSeq();
    p.tick(INTENT, seq);
    const outcome = p.reconcile({ x: agreed.x, z: agreed.z, facing: 0, lastSeq: seq });
    expect(outcome).toBe("snap");
    expect(p.sim.x).toBeCloseTo(agreed.x, 9);
    expect(p.pending()).toEqual({ x: 0, z: 0 });
  });

  it("initialises from the first snapshot and ignores unknown seqs", () => {
    const p = new Predictor({ x: 0, z: 0 });
    expect(p.reconcile({ x: 10, z: 20, facing: 1, lastSeq: 0 })).toBe("snap");
    expect(p.sim.x).toBe(10);
    expect(p.sim.facing).toBe(1);
    expect(p.reconcile({ x: 11, z: 21, facing: 1, lastSeq: 999 })).toBe("none");
  });

  it("evicts old seqs from the ring buffer", () => {
    const p = new Predictor({ x: WORLD.spawn.x, z: WORLD.spawn.z });
    p.reconcile({ x: WORLD.spawn.x, z: WORLD.spawn.z, facing: 0, lastSeq: 0 });
    for (let i = 0; i < 200; i += 1) p.tick(INTENT, p.nextSeq());
    expect(p.reconcile({ x: 0, z: 0, facing: 0, lastSeq: 1 })).toBe("none");
    expect(p.reconcile({ x: 0, z: 0, facing: 0, lastSeq: 200 })).not.toBe("none");
  });

  it("resets to a snapshot on mode changes", () => {
    const p = new Predictor({ x: 0, z: 0 });
    p.tick(INTENT, p.nextSeq());
    p.reset(5, 6, 2);
    expect(p.sim.x).toBe(5);
    expect(p.sim.pose).toBe("stand");
    expect(p.sim.route).toEqual([]);
    expect(p.pending()).toEqual({ x: 0, z: 0 });
    expect(p.reconcile({ x: 5, z: 6, facing: 2, lastSeq: 1 })).toBe("none");
  });
});

describe("followSnapshot", () => {
  it("eases over small gaps and snaps over jumps", () => {
    const cur = { x: 0, z: 0, facing: 0 };
    expect(followSnapshot(cur, { x: 0.1, z: 0, facing: 0 }, 0.016)).toBe(false);
    expect(cur.x).toBeGreaterThan(0);
    expect(cur.x).toBeLessThan(0.1);
    expect(followSnapshot(cur, { x: 5, z: 0, facing: 1 }, 0.016)).toBe(true);
    expect(cur.x).toBe(5);
    expect(cur.facing).toBe(1);
  });

  it("turns the short way round", () => {
    const cur = { x: 0, z: 0, facing: 3.0 };
    followSnapshot(cur, { x: 0, z: 0, facing: -3.0 }, 0.016);
    expect(cur.facing).toBeGreaterThan(3.0); // towards +pi, not back through 0
  });
});
