import { describe, expect, it } from "vitest";
import { TICK_DT, WORLD, spawnPlayer, stepPlayer, type StepInput } from "@office/shared";
import { InputQueue, MAX_BORROWED_STEPS, MAX_QUEUED_INPUTS, type QueuedInput } from "./inputs.js";

const WALK: StepInput = { kind: "intent", dx: 1, dz: 0, run: false };
const STOP: StepInput = { kind: "intent", dx: 0, dz: 0, run: false };

describe("InputQueue", () => {
  it("applies queued inputs in order, one per tick", () => {
    const q = new InputQueue();
    q.push({ input: WALK, seq: 1 });
    q.push({ input: WALK, seq: 2 });
    q.push({ input: STOP, seq: 3 });
    expect(q.next()).toEqual({ kind: "apply", input: WALK, seq: 1 });
    expect(q.next()).toEqual({ kind: "apply", input: WALK, seq: 2 });
    expect(q.next()).toEqual({ kind: "apply", input: STOP, seq: 3 });
    expect(q.next()).toEqual({ kind: "idle" });
  });

  it("re-applies held keys while nothing is queued", () => {
    const q = new InputQueue();
    q.push({ input: WALK, seq: 1 });
    expect(q.next().kind).toBe("apply");
    expect(q.next()).toEqual({ kind: "hold", input: WALK });
    expect(q.next()).toEqual({ kind: "hold", input: WALK });
  });

  it("counts a late input against the step it already took", () => {
    const q = new InputQueue();
    q.push({ input: WALK, seq: 1 });
    q.next(); // apply 1
    expect(q.next().kind).toBe("hold"); // 2 is late: walk on
    q.push({ input: WALK, seq: 2 });
    expect(q.next()).toEqual({ kind: "ack", seq: 2 }); // already walked: no second step
    q.push({ input: WALK, seq: 3 });
    expect(q.next()).toEqual({ kind: "apply", input: WALK, seq: 3 });
  });

  it("applies a changed input normally after holding", () => {
    const q = new InputQueue();
    q.push({ input: WALK, seq: 1 });
    q.next();
    q.next(); // hold
    q.push({ input: STOP, seq: 2 });
    expect(q.next()).toEqual({ kind: "apply", input: STOP, seq: 2 });
    expect(q.next()).toEqual({ kind: "idle" }); // released keys are not held
    q.push({ input: STOP, seq: 3 });
    expect(q.next()).toEqual({ kind: "apply", input: STOP, seq: 3 });
  });

  it("borrows at most MAX_BORROWED_STEPS", () => {
    const q = new InputQueue();
    q.push({ input: WALK, seq: 1 });
    q.next();
    for (let i = 0; i < MAX_BORROWED_STEPS + 3; i += 1) expect(q.next().kind).toBe("hold");
    let seq = 1;
    for (let i = 0; i < MAX_BORROWED_STEPS; i += 1) {
      seq += 1;
      q.push({ input: WALK, seq });
      expect(q.next()).toEqual({ kind: "ack", seq });
    }
    q.push({ input: WALK, seq: seq + 1 });
    expect(q.next()).toEqual({ kind: "apply", input: WALK, seq: seq + 1 });
  });

  it("a target ends held keys and borrowed steps", () => {
    const q = new InputQueue();
    q.push({ input: WALK, seq: 1 });
    q.next();
    q.next(); // hold
    const target: StepInput = { kind: "target", x: 3, z: 4 };
    q.push({ input: target, seq: 2 });
    expect(q.next()).toEqual({ kind: "apply", input: target, seq: 2 });
    expect(q.next()).toEqual({ kind: "idle" }); // the sim follows the route
  });

  it("drops the oldest inputs beyond MAX_QUEUED_INPUTS", () => {
    const q = new InputQueue();
    for (let seq = 1; seq <= MAX_QUEUED_INPUTS + 2; seq += 1) q.push({ input: WALK, seq });
    expect(q.length).toBe(MAX_QUEUED_INPUTS);
    expect(q.next()).toEqual({ kind: "apply", input: WALK, seq: 3 });
  });

  it("clear() forgets queued inputs, held keys and borrowed steps", () => {
    const q = new InputQueue();
    q.push({ input: WALK, seq: 1 });
    q.next();
    q.next(); // hold
    q.push({ input: WALK, seq: 2 });
    q.clear();
    expect(q.length).toBe(0);
    expect(q.next()).toEqual({ kind: "idle" });
    q.push({ input: WALK, seq: 3 });
    expect(q.next()).toEqual({ kind: "apply", input: WALK, seq: 3 });
  });

  it("takeLatest() hands over the newest queued input and empties the queue", () => {
    const q = new InputQueue();
    expect(q.takeLatest()).toBeNull();
    q.push({ input: WALK, seq: 1 });
    q.push({ input: STOP, seq: 2 });
    expect(q.takeLatest()).toEqual({ input: STOP, seq: 2 });
    expect(q.length).toBe(0);
  });

  it("keeps the server on the client's prediction under Windows timer jitter", () => {
    // The client ticks every 50 ms and its input lands 1 ms later; the server ticks at the
    // first 15.625 ms grid point after each 50 ms boundary (gaps of 46.875 and 62.5 ms).
    // Whenever lastSeq moves on, the server must stand exactly where the client predicted
    // for that seq, so reconciliation has nothing to correct.
    for (let phase = 0; phase < 50; phase += 1) {
      const spawn = { x: WORLD.spawn.x, z: WORLD.spawn.z };
      const client = spawnPlayer(spawn);
      const server = spawnPlayer(spawn);
      const predicted = new Map<number, { x: number; z: number }>();
      const arrivals: { at: number; held: QueuedInput }[] = [];
      let seq = 0;
      for (let t = phase; t < 4000; t += 50) {
        seq += 1;
        const input = t < 3000 ? WALK : STOP;
        stepPlayer(client, input, TICK_DT);
        predicted.set(seq, { x: client.x, z: client.z });
        arrivals.push({ at: t + 1, held: { input, seq } });
      }
      const q = new InputQueue();
      let next = 0;
      let checked = 0;
      let worst = 0;
      for (let n = 1; n * 50 < 4500; n += 1) {
        const at = Math.ceil((n * 50) / 15.625) * 15.625;
        while (next < arrivals.length && arrivals[next].at <= at) q.push(arrivals[next++].held);
        const d = q.next();
        if (d.kind === "apply" || d.kind === "hold") stepPlayer(server, d.input, TICK_DT);
        else if (d.kind === "idle") stepPlayer(server, null, TICK_DT);
        if (d.kind === "apply" || d.kind === "ack") {
          const p = predicted.get(d.seq)!;
          worst = Math.max(worst, Math.hypot(server.x - p.x, server.z - p.z));
          checked += 1;
        }
      }
      expect(checked, `phase ${phase}`).toBe(seq); // every input acknowledged
      expect(worst, `phase ${phase}`).toBe(0);
    }
  });
});

describe("InputQueue undoing borrowed steps", () => {
  it("undoes held steps the client never took when a changed input arrives late", () => {
    const q = new InputQueue<string>();
    q.push({ input: WALK, seq: 1 });
    expect(q.next("s0").kind).toBe("apply");
    expect(q.next("s1")).toEqual({ kind: "hold", input: WALK }); // the release is late
    expect(q.next("s2")).toEqual({ kind: "hold", input: WALK });
    q.push({ input: STOP, seq: 2 });
    // The client stopped where it stood before the first held step: go back there first.
    expect(q.next("s3")).toEqual({ kind: "apply", input: STOP, seq: 2, restore: "s1" });
  });

  it("does not undo a held step once its late input has acknowledged it", () => {
    const q = new InputQueue<string>();
    q.push({ input: WALK, seq: 1 });
    q.next("s0");
    q.next("s1"); // hold
    q.next("s2"); // hold
    q.push({ input: WALK, seq: 2 });
    expect(q.next("s3")).toEqual({ kind: "ack", seq: 2 }); // pays for the hold from s1
    q.push({ input: STOP, seq: 3 });
    expect(q.next("s3")).toEqual({ kind: "apply", input: STOP, seq: 3, restore: "s2" });
  });

  it("keeps the server on the client's prediction with random network delay, releases included", () => {
    // As the Windows-grid test above, plus a seeded 0..30 ms delay per input (in order, as
    // on one socket), and the keys pressed and released several times.
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const keysAt = (t: number) => t < 5600 && Math.floor(t / 700) % 2 === 0; // ends released
    for (let phase = 0; phase < 50; phase += 1) {
      const spawn = { x: WORLD.spawn.x, z: WORLD.spawn.z };
      const client = spawnPlayer(spawn);
      const server = spawnPlayer(spawn);
      const predicted = new Map<number, { x: number; z: number }>();
      const arrivals: { at: number; held: QueuedInput }[] = [];
      let seq = 0;
      let held = false;
      let lastArrival = 0;
      for (let t = phase; t < 6000; t += 50) {
        const down = keysAt(t);
        if (!down && !held) continue; // nothing to send while standing
        seq += 1;
        const input = down ? WALK : STOP;
        held = down;
        stepPlayer(client, input, TICK_DT);
        predicted.set(seq, { x: client.x, z: client.z });
        lastArrival = Math.max(lastArrival, t + 1 + rand() * 30);
        arrivals.push({ at: lastArrival, held: { input, seq } });
      }
      const q = new InputQueue<{ x: number; z: number; facing: number }>();
      let next = 0;
      let worst = 0;
      for (let n = 1; n * 50 < 6500; n += 1) {
        const at = Math.ceil((n * 50) / 15.625) * 15.625;
        while (next < arrivals.length && arrivals[next].at <= at) q.push(arrivals[next++].held);
        const d = q.next({ x: server.x, z: server.z, facing: server.facing });
        if (d.kind === "apply" && d.restore) Object.assign(server, d.restore);
        if (d.kind === "apply" || d.kind === "hold") stepPlayer(server, d.input, TICK_DT);
        else if (d.kind === "idle") stepPlayer(server, null, TICK_DT);
        if (d.kind === "apply" || d.kind === "ack") {
          const p = predicted.get(d.seq)!;
          worst = Math.max(worst, Math.hypot(server.x - p.x, server.z - p.z));
        }
      }
      expect(worst, `phase ${phase}`).toBe(0);
      expect(Math.hypot(server.x - client.x, server.z - client.z), `phase ${phase} end`).toBe(0);
    }
  });
});
