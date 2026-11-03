import { afterEach, describe, expect, it, vi } from "vitest";
import { Server } from "@colyseus/core";
import { ColyseusTestServer } from "@colyseus/testing";
import { WebSocketTransport } from "@colyseus/ws-transport";
import {
  CLIENT_MESSAGE,
  DESK_SEATS,
  OFFICE_WALK,
  PROTOCOL_VERSION,
  SERVER_MESSAGE,
  TICK_DT,
  WALK_SPEED,
  WalkMap,
  WORKSPACE_ID,
  WORLD,
  spawnPlayer,
  stepPlayer,
  zoneAt,
  type Point,
} from "@office/shared";
import { RegistryBus } from "./bus.js";
import { OfficeRoom } from "./office.room.js";
import { getRoom } from "./rooms.js";

// `Server.listen()` dynamically imports `@pm2/io` when it resolves (Stats.reset), and the
// import spams the worker's IPC channel with `axm:` messages, which breaks vitest's forks
// pool (see server.test.ts). Swallow only those messages for this file.
const realSend = process.send?.bind(process);
const filteredSend = function (
  this: unknown,
  message: unknown,
  ...rest: never[]
): boolean {
  if (
    message !== null &&
    typeof message === "object" &&
    "type" in message &&
    typeof message.type === "string" &&
    message.type.startsWith("axm:")
  ) {
    return false;
  }
  return realSend?.(message as never, ...(rest as never[])) ?? false;
} as typeof process.send;
process.send = filteredSend;

const LOOK = {
  body: "casual",
  top: "#f2f2ef",
  accent: "#f2f2ef",
  bottom: "#34495e",
  shoes: "#24262a",
  height: 1.68,
} as const;

const SPAWN = { x: WORLD.spawn.x, z: WORLD.spawn.z };

function joinOptions(displayName: string, overrides: Record<string, unknown> = {}) {
  return {
    protocol: PROTOCOL_VERSION,
    displayName,
    workspaceId: WORKSPACE_ID,
    look: { ...LOOK },
    ...overrides,
  };
}

type TestRoom = Awaited<ReturnType<ColyseusTestServer["sdk"]["joinOrCreate"]>>;

async function boot(): Promise<{ gameServer: Server; testServer: ColyseusTestServer }> {
  const gameServer = new Server({ transport: new WebSocketTransport() });
  gameServer.define("office", OfficeRoom).filterBy(["workspaceId"]);
  await gameServer.listen(0);
  const transport = gameServer.transport as unknown as {
    server?: { address(): { port: number } | string | null };
  };
  const address = transport.server?.address();
  if (!address || typeof address === "string") {
    throw new Error("the test server has no port");
  }
  // `ColyseusTestServer` dials `server.port`; point it at the ephemeral port.
  (gameServer as unknown as Record<string, unknown>)["port"] = address.port;
  return { gameServer, testServer: new ColyseusTestServer(gameServer) };
}

async function join(testServer: ColyseusTestServer, name: string): Promise<TestRoom> {
  testServer.sdk.auth.token = `dev:${name}`;
  const room = await testServer.sdk.joinOrCreate("office", joinOptions(name));
  await room.waitForInitialState();
  return room;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(cond: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (cond()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await sleep(50);
  }
}

/** A walkable point with a valid path from `from`, in the nearest ring that has one. */
function walkableNear(from: Point, minD: number, maxD: number): Point {
  for (let r = minD; r <= maxD; r += 0.5) {
    for (let k = 0; k < 16; k += 1) {
      const q = {
        x: from.x + Math.cos((k / 16) * Math.PI * 2) * r,
        z: from.z + Math.sin((k / 16) * Math.PI * 2) * r,
      };
      if (
        OFFICE_WALK.isWalkable(q.x, q.z) &&
        OFFICE_WALK.findPath(from, q).length > 0 &&
        Math.hypot(q.x - from.x, q.z - from.z) >= minD
      ) {
        return q;
      }
    }
  }
  throw new Error("no walkable point found");
}

function unwalkableNear(from: Point): Point {
  for (let r = 0.5; r <= 8; r += 0.5) {
    for (let k = 0; k < 16; k += 1) {
      const q = {
        x: from.x + Math.cos((k / 16) * Math.PI * 2) * r,
        z: from.z + Math.sin((k / 16) * Math.PI * 2) * r,
      };
      if (!OFFICE_WALK.isWalkable(q.x, q.z)) return q;
    }
  }
  throw new Error("no unwalkable point found");
}

/** The desk seat with the shortest route from spawn (keeps activity tests fast). */
function nearestSeat(): { id: string } {
  let best = DESK_SEATS[0];
  let bestLen = Number.POSITIVE_INFINITY;
  for (const seat of DESK_SEATS) {
    const route = OFFICE_WALK.findPath(SPAWN, seat.aisle);
    if (route.length > 0 && route.length < bestLen) {
      best = seat;
      bestLen = route.length;
    }
  }
  return best;
}

/** A reachable point in a zone other than the spawn's, with its route length in metres. */
function otherZoneTarget(): { x: number; z: number; zoneId: string; dist: number } {
  const home = zoneAt(SPAWN.x, SPAWN.z)?.id ?? "";
  for (let r = 1; r <= 40; r += 1) {
    for (let k = 0; k < 24; k += 1) {
      const q = {
        x: SPAWN.x + Math.cos((k / 24) * Math.PI * 2) * r,
        z: SPAWN.z + Math.sin((k / 24) * Math.PI * 2) * r,
      };
      if (!OFFICE_WALK.isWalkable(q.x, q.z)) continue;
      const zid = zoneAt(q.x, q.z)?.id ?? "";
      if (zid === "" || zid === home) continue;
      const route = OFFICE_WALK.findPath(SPAWN, q);
      if (route.length === 0) continue;
      let dist = 0;
      for (let i = 1; i < route.length; i += 1) {
        dist += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
      }
      return { x: q.x, z: q.z, zoneId: zid, dist };
    }
  }
  throw new Error("no reachable zone found");
}

function serverPlayer(sessionId: string) {
  return getRoom(WORKSPACE_ID)?.state.players.get(sessionId);
}

/** What a joined client sees; the SDK types the state as unknown without a schema. */
function clientPlayers(room: TestRoom): Map<string, { name: string; userId: string }> {
  return (room as unknown as { state: { players: Map<string, { name: string; userId: string }> } })
    .state.players;
}

describe("OfficeRoom", () => {
  let gameServer: Server | null = null;
  let testServer: ColyseusTestServer | null = null;

  afterEach(async () => {
    process.send = realSend;
    if (testServer) {
      await testServer.cleanup().catch(() => undefined);
      testServer = null;
    }
    if (gameServer) {
      await gameServer.gracefullyShutdown(false).catch(() => undefined);
      gameServer = null;
    }
    OfficeRoom.verifier = null;
    process.send = filteredSend;
  });

  async function setup(): Promise<{ testServer: ColyseusTestServer }> {
    const booted = await boot();
    gameServer = booted.gameServer;
    testServer = booted.testServer;
    return { testServer };
  }

  it("refuses bad tokens, wrong workspaces and stale protocols", { timeout: 15000 }, async () => {
    const { testServer } = await setup();
    testServer.sdk.auth.token = "bogus";
    await expect(testServer.sdk.joinOrCreate("office", joinOptions("Maya"))).rejects.toThrow(
      /unauthorized/,
    );
    testServer.sdk.auth.token = "";
    await expect(testServer.sdk.joinOrCreate("office", joinOptions("Maya"))).rejects.toThrow(
      /unauthorized/,
    );
    testServer.sdk.auth.token = "dev:Maya";
    await expect(
      testServer.sdk.joinOrCreate("office", joinOptions("Maya", { workspaceId: "other" })),
    ).rejects.toThrow(/unauthorized/);
    await expect(
      testServer.sdk.joinOrCreate("office", joinOptions("Maya", { protocol: 0 })),
    ).rejects.toThrow(/protocol_mismatch/);
    await expect(
      testServer.sdk.joinOrCreate("office", joinOptions("   ")),
    ).rejects.toThrow(/invalid_message/);
  });

  it("lets two clients see each other", { timeout: 15000 }, async () => {
    const { testServer } = await setup();
    const maya = await join(testServer, "Maya");
    const arjun = await join(testServer, "Arjun");
    await waitFor(
      () => clientPlayers(maya).size === 2 && clientPlayers(arjun).size === 2,
      10000,
      "both clients to see two players",
    );
    const names = [...clientPlayers(maya).values()].map((p) => p.name).sort();
    expect(names).toEqual(["Arjun", "Maya"]);
    expect(getRoom(WORKSPACE_ID)?.state.players.size).toBe(2);
    expect(serverPlayer(maya.sessionId)?.userId).toBe("dev-maya");
    expect(clientPlayers(maya).get(maya.sessionId)?.userId).toBe("dev-maya");
  });

  it("moves with intent, reporting lastSeq, pose and speed", { timeout: 15000 }, async () => {
    const { testServer } = await setup();
    const room = await join(testServer, "Maya");
    const before = { x: serverPlayer(room.sessionId)?.x, z: serverPlayer(room.sessionId)?.z };
    room.send(CLIENT_MESSAGE.moveIntent, { seq: 7, dx: 1, dz: 0, run: false });
    await waitFor(() => serverPlayer(room.sessionId)?.lastSeq === 7, 5000, "lastSeq 7");
    const moving = serverPlayer(room.sessionId);
    expect(moving?.pose).toBe("walk");
    expect(moving?.speed).toBeGreaterThan(0);
    expect(Math.hypot(moving!.x - before.x!, moving!.z - before.z!)).toBeGreaterThan(0.05);
    // Releasing the keys stops the avatar; the next tick stands still.
    room.send(CLIENT_MESSAGE.moveIntent, { seq: 8, dx: 0, dz: 0, run: false });
    await waitFor(() => serverPlayer(room.sessionId)?.lastSeq === 8, 5000, "lastSeq 8");
    await waitFor(
      () => serverPlayer(room.sessionId)?.pose === "stand",
      5000,
      "standing after release",
    );
    expect(serverPlayer(room.sessionId)?.speed).toBe(0);
  });

  it("routes a move_target and rejects an unwalkable one", { timeout: 30000 }, async () => {
    const { testServer } = await setup();
    const room = await join(testServer, "Maya");
    const me = serverPlayer(room.sessionId);
    const target = walkableNear({ x: me!.x, z: me!.z }, 1.5, 4);
    room.send(CLIENT_MESSAGE.moveTarget, { seq: 3, ...target });
    await waitFor(() => serverPlayer(room.sessionId)?.lastSeq === 3, 5000, "lastSeq 3");
    await waitFor(() => {
      const p = serverPlayer(room.sessionId);
      return !!p && Math.hypot(p.x - target.x, p.z - target.z) < 0.3;
    }, 15000, "arrival at the target");
    // A target inside a wall is rejected and changes nothing.
    const wall = unwalkableNear({ x: target.x, z: target.z });
    const waiting = room.waitForMessage(SERVER_MESSAGE.error, 5000);
    room.send(CLIENT_MESSAGE.moveTarget, { seq: 4, ...wall });
    const err = await waiting;
    expect(err.code).toBe("unwalkable");
    await sleep(300);
    const p = serverPlayer(room.sessionId);
    expect(p?.lastSeq).toBe(3);
    expect(Math.hypot(p!.x - target.x, p!.z - target.z)).toBeLessThan(0.5);
  });

  it("rejects tampered input without moving", { timeout: 15000 }, async () => {
    const { testServer } = await setup();
    const room = await join(testServer, "Maya");
    const me = serverPlayer(room.sessionId);
    const at = { x: me!.x, z: me!.z };
    for (const bad of [
      { seq: 1, dx: 2, dz: 0, run: false }, // out of range
      { seq: 2, dx: Number.NaN, dz: 0, run: false }, // NaN
      { seq: 3, dx: 1, dz: 0, run: false, x: 1 }, // extra field
    ]) {
      const waiting = room.waitForMessage(SERVER_MESSAGE.error, 5000);
      room.send(CLIENT_MESSAGE.moveIntent, bad);
      expect((await waiting).code).toBe("invalid_message");
    }
    await sleep(300);
    const p = serverPlayer(room.sessionId);
    expect(p?.lastSeq).toBe(0);
    expect(p?.pose).toBe("stand");
    expect(Math.hypot(p!.x - at.x, p!.z - at.z)).toBeLessThan(0.01);
  });

  it("rate-limits a flood and recovers", { timeout: 15000 }, async () => {
    const { testServer } = await setup();
    const room = await join(testServer, "Maya");
    const errors: { code: string }[] = [];
    room.onMessage(SERVER_MESSAGE.error, (msg) => errors.push(msg));
    for (let seq = 1; seq <= 60; seq += 1) {
      room.send(CLIENT_MESSAGE.moveIntent, { seq, dx: 1, dz: 0, run: true });
    }
    await waitFor(() => errors.length > 0, 5000, "a rate limit error");
    expect(errors[0].code).toBe("rate_limited");
    await sleep(1200);
    room.send(CLIENT_MESSAGE.moveIntent, { seq: 61, dx: 0, dz: 0, run: false });
    await waitFor(() => serverPlayer(room.sessionId)?.lastSeq === 61, 5000, "recovery");
  });

  it("clamps speed and never crosses walls over 10 s", { timeout: 30000 }, async () => {
    const { testServer } = await setup();
    const room = await join(testServer, "Maya");
    room.send(CLIENT_MESSAGE.moveIntent, { seq: 1, dx: 0, dz: -1, run: true });
    const samples: { at: number; x: number; z: number }[] = [];
    const start = Date.now();
    let seq = 1;
    while (Date.now() - start < 10000) {
      const p = serverPlayer(room.sessionId);
      samples.push({ at: Date.now(), x: p!.x, z: p!.z });
      seq += 1;
      room.send(CLIENT_MESSAGE.moveIntent, { seq, dx: 0, dz: -1, run: true });
      await sleep(200);
    }
    expect(samples.length).toBeGreaterThan(20);
    for (const s of samples) {
      expect(OFFICE_WALK.isWalkable(s.x, s.z)).toBe(true);
    }
    for (let i = 1; i < samples.length; i += 1) {
      const dt = (samples[i].at - samples[i - 1].at) / 1000;
      const dist = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z);
      // Fixed steps cap each tick at MAX_SPEED * TICK_DT; sampling can only add one tick.
      expect(dist).toBeLessThanOrEqual(WalkMap.MAX_SPEED * dt + WalkMap.MAX_SPEED * TICK_DT);
    }
  });

  it("walks at WALK_SPEED in wall-clock time, whatever the timer granularity", { timeout: 30000 }, async () => {
    // The client predicts TICK_HZ steps a second. A 50 ms setInterval fires every 62.5 ms
    // on Windows, which made the room walk at 80% of that and the avatar snap back.
    const { testServer } = await setup();
    const room = await join(testServer, "Maya");
    const me = serverPlayer(room.sessionId);
    const target = walkableNear({ x: me!.x, z: me!.z }, 6, 12);
    room.send(CLIENT_MESSAGE.moveTarget, { seq: 1, ...target });
    await waitFor(() => (serverPlayer(room.sessionId)?.speed ?? 0) > 0, 5000, "walking");
    const samples: { at: number; x: number; z: number }[] = [];
    const start = performance.now();
    while (performance.now() - start < 1500) {
      const p = serverPlayer(room.sessionId)!;
      const last = samples.at(-1);
      if (!last || last.x !== p.x || last.z !== p.z) {
        samples.push({ at: performance.now(), x: p.x, z: p.z });
      }
      await sleep(5);
    }
    let dist = 0;
    for (let i = 1; i < samples.length; i += 1) {
      dist += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z);
    }
    const secs = (samples.at(-1)!.at - samples[0].at) / 1000;
    expect(dist / secs).toBeGreaterThan(WALK_SPEED * 0.85);
    expect(dist / secs).toBeLessThan(WALK_SPEED * 1.1);
  });

  it("applies every held input once, even when several arrive between ticks", { timeout: 15000 }, async () => {
    // The client predicts one step per input; the room used to keep only the newest input
    // of a tick, so a burst lost steps and the avatar was corrected backwards.
    const { testServer } = await setup();
    const room = await join(testServer, "Maya");
    const me = serverPlayer(room.sessionId)!;
    const reference = spawnPlayer({ x: me.x, z: me.z }, me.facing);
    stepPlayer(reference, { kind: "intent", dx: 1, dz: 0, run: false }, TICK_DT);
    stepPlayer(reference, { kind: "intent", dx: 1, dz: 0, run: false }, TICK_DT);
    stepPlayer(reference, { kind: "intent", dx: 0, dz: 0, run: false }, TICK_DT);
    room.send(CLIENT_MESSAGE.moveIntent, { seq: 1, dx: 1, dz: 0, run: false });
    room.send(CLIENT_MESSAGE.moveIntent, { seq: 2, dx: 1, dz: 0, run: false });
    room.send(CLIENT_MESSAGE.moveIntent, { seq: 3, dx: 0, dz: 0, run: false });
    await waitFor(() => serverPlayer(room.sessionId)?.lastSeq === 3, 5000, "lastSeq 3");
    const p = serverPlayer(room.sessionId)!;
    expect(p.x).toBeCloseTo(reference.x, 9);
    expect(p.z).toBeCloseTo(reference.z, 9);
    expect(p.pose).toBe("stand");
  });

  it("syncs the reservations, so clients offer only free seats", { timeout: 15000 }, async () => {
    // A colleague's desk stays theirs while they are away; without this, a client offered it
    // to sit at and the room refused (`target_taken`).
    const { testServer } = await setup();
    const room = await join(testServer, "Maya");
    const clientTaken = () =>
      [...((room as unknown as { state: { taken?: Iterable<string> } }).state.taken ?? [])].sort();
    const serverTaken = () => [...(getRoom(WORKSPACE_ID)?.reservations ?? [])].sort();
    await waitFor(
      () => serverTaken().length > 0 && JSON.stringify(clientTaken()) === JSON.stringify(serverTaken()),
      5000,
      "the client to hold the room's reservations",
    );
    const seat = DESK_SEATS.find((s) => !serverTaken().includes(s.id))!;
    room.send(CLIENT_MESSAGE.activityStart, { seq: 1, targetId: seat.id });
    await waitFor(() => clientTaken().includes(seat.id), 5000, "the new reservation on the client");
  });

  it("restores the player and their seat on reconnect", { timeout: 30000 }, async () => {
    const { testServer } = await setup();
    const room = await join(testServer, "Maya");
    const seat = nearestSeat();
    room.send(CLIENT_MESSAGE.activityStart, { seq: 1, targetId: seat.id });
    await waitFor(
      () => getRoom(WORKSPACE_ID)?.reservations.has(seat.id) === true,
      5000,
      "the reservation",
    );
    const me = serverPlayer(room.sessionId);
    const at = { x: me!.x, z: me!.z };
    const token = room.reconnectionToken;
    expect(typeof token).toBe("string");
    await room.leave(false);
    const back = await testServer.sdk.reconnect(token);
    await back.waitForInitialState();
    expect(back.sessionId).toBe(room.sessionId);
    const p = serverPlayer(room.sessionId);
    expect(p).toBeDefined();
    expect(Math.hypot(p!.x - at.x, p!.z - at.z)).toBeLessThan(0.5);
    expect(getRoom(WORKSPACE_ID)?.reservations.has(seat.id)).toBe(true);
    // The seat is still held: another player cannot take it.
    const arjun = await join(testServer, "Arjun");
    const waiting = arjun.waitForMessage(SERVER_MESSAGE.error, 5000);
    arjun.send(CLIENT_MESSAGE.activityStart, { seq: 1, targetId: seat.id });
    expect((await waiting).code).toBe("target_taken");
  });

  it("refuses a seat one player holds to another", { timeout: 15000 }, async () => {
    const { testServer } = await setup();
    const maya = await join(testServer, "Maya");
    const arjun = await join(testServer, "Arjun");
    const seat = nearestSeat();
    maya.send(CLIENT_MESSAGE.activityStart, { seq: 1, targetId: seat.id });
    await waitFor(
      () => getRoom(WORKSPACE_ID)?.reservations.has(seat.id) === true,
      5000,
      "the reservation",
    );
    const waiting = arjun.waitForMessage(SERVER_MESSAGE.error, 5000);
    arjun.send(CLIENT_MESSAGE.activityStart, { seq: 1, targetId: seat.id });
    expect((await waiting).code).toBe("target_taken");
    // Stopping frees the seat while still walking over.
    maya.send(CLIENT_MESSAGE.activityStop, { seq: 2 });
    await waitFor(
      () => getRoom(WORKSPACE_ID)?.reservations.has(seat.id) === false,
      5000,
      "the release",
    );
    arjun.send(CLIENT_MESSAGE.activityStart, { seq: 2, targetId: seat.id });
    await waitFor(
      () => getRoom(WORKSPACE_ID)?.reservations.has(seat.id) === true,
      5000,
      "the re-reservation",
    );
  });

  it("sits down and stands up through the tick", { timeout: 90000 }, async () => {
    const { testServer } = await setup();
    const room = await join(testServer, "Maya");
    const seat = nearestSeat();
    room.send(CLIENT_MESSAGE.activityStart, { seq: 1, targetId: seat.id });
    await waitFor(
      () => serverPlayer(room.sessionId)?.activity.kind === "seat",
      45000,
      "arrival at the chair",
    );
    expect(serverPlayer(room.sessionId)?.activity.targetId).toBe(seat.id);
    await waitFor(() => serverPlayer(room.sessionId)?.pose === "type", 30000, "typing");
    // Moving stands up first, then applies the stashed input.
    room.send(CLIENT_MESSAGE.moveIntent, { seq: 2, dx: 0, dz: 1, run: false });
    await waitFor(
      () => serverPlayer(room.sessionId)?.activity.kind === "",
      30000,
      "standing up",
    );
    expect(getRoom(WORKSPACE_ID)?.reservations.has(seat.id)).toBe(false);
    await waitFor(() => serverPlayer(room.sessionId)?.lastSeq === 2, 5000, "the queued input");
  });

  it("sends zone_event on zone change", { timeout: 90000 }, async () => {
    const { testServer } = await setup();
    const room = await join(testServer, "Maya");
    const target = otherZoneTarget();
    const events: { userId: string; zoneId: string; kind: string }[] = [];
    room.onMessage(SERVER_MESSAGE.zoneEvent, (msg) => events.push(msg));
    room.send(CLIENT_MESSAGE.moveTarget, { seq: 1, x: target.x, z: target.z });
    const budget = Math.min(80000, (target.dist / 2.3) * 1000 + 15000);
    await waitFor(
      () => events.some((e) => e.kind === "enter" && e.zoneId === target.zoneId),
      budget,
      `entering ${target.zoneId}`,
    );
    expect(events.find((e) => e.kind === "enter")).toMatchObject({ userId: "dev-maya" });
    expect(serverPlayer(room.sessionId)?.zoneId).toBe(target.zoneId);
  });

  it("broadcasts chat and replays history to late joiners", { timeout: 15000 }, async () => {
    const { testServer } = await setup();
    const maya = await join(testServer, "Maya");
    const arjun = await join(testServer, "Arjun");
    const waiting = arjun.waitForMessage(SERVER_MESSAGE.chat, 5000);
    maya.send(CLIENT_MESSAGE.chatSend, { text: "hello office" });
    const chat = await waiting;
    expect(chat).toMatchObject({ userId: "dev-maya", name: "Maya", text: "hello office" });
    expect(typeof chat.id).toBe("string");
    // Flooding chat is limited to 5 per 10 s; the room already sent one.
    const errors: { code: string }[] = [];
    maya.onMessage(SERVER_MESSAGE.error, (msg) => errors.push(msg));
    for (let i = 0; i < 5; i += 1) {
      maya.send(CLIENT_MESSAGE.chatSend, { text: `spam ${i}` });
    }
    await waitFor(() => errors.length > 0, 5000, "a chat rate limit");
    expect(errors[0].code).toBe("rate_limited");
    // A late joiner pulls the recent history (the 5 that fit, not the dropped one).
    testServer.sdk.auth.token = "dev:Maya";
    const late = await testServer.sdk.joinOrCreate("office", joinOptions("Maya"));
    late.send(CLIENT_MESSAGE.historyRequest, {});
    const history = await late.waitForMessage(SERVER_MESSAGE.chatHistory, 5000);
    expect(history.messages).toHaveLength(5);
    expect(history.messages[0].text).toBe("hello office");
    await late.waitForInitialState();
  });

  it("teleports in dev, refuses walls and production", { timeout: 30000 }, async () => {
    const { testServer } = await setup();
    const room = await join(testServer, "Maya");
    const target = otherZoneTarget();
    const errors: { code: string }[] = [];
    room.onMessage(SERVER_MESSAGE.error, (msg) => errors.push(msg));
    room.send(CLIENT_MESSAGE.teleportAdmin, { x: target.x, z: target.z });
    await waitFor(() => {
      const p = serverPlayer(room.sessionId);
      return p?.x === target.x && p?.z === target.z;
    }, 5000, "the teleport");
    expect(serverPlayer(room.sessionId)?.zoneId).toBe(target.zoneId);
    room.send(CLIENT_MESSAGE.teleportAdmin, { x: 9999, z: 9999 });
    await waitFor(
      () => errors.some((e) => e.code === "unwalkable"),
      5000,
      "the wall rejection",
    );
    vi.stubEnv("NODE_ENV", "production");
    try {
      room.send(CLIENT_MESSAGE.teleportAdmin, { x: target.x, z: target.z });
      await waitFor(
        () => errors.some((e) => e.code === "invalid_message"),
        5000,
        "the production refusal",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("updates status and look", { timeout: 15000 }, async () => {
    const { testServer } = await setup();
    const room = await join(testServer, "Maya");
    room.send(CLIENT_MESSAGE.statusSet, { status: "in_meeting" });
    await waitFor(
      () => serverPlayer(room.sessionId)?.status === "in_meeting",
      5000,
      "the status",
    );
    const look = { ...LOOK, body: "suit", height: 1.8 } as const;
    room.send(CLIENT_MESSAGE.lookSet, { look });
    await waitFor(() => serverPlayer(room.sessionId)?.look.body === "suit", 5000, "the look");
    expect(serverPlayer(room.sessionId)?.look.height).toBe(1.8);
    const waiting = room.waitForMessage(SERVER_MESSAGE.error, 5000);
    room.send(CLIENT_MESSAGE.statusSet, { status: "napping" });
    expect((await waiting).code).toBe("invalid_message");
  });

  it("broadcasts records_changed through the registry bus", { timeout: 15000 }, async () => {
    const { testServer } = await setup();
    const room = await join(testServer, "Maya");
    const waiting = room.waitForMessage(SERVER_MESSAGE.recordsChanged, 5000);
    new RegistryBus().recordsChanged(WORKSPACE_ID, ["tasks", "meetings"]);
    expect(await waiting).toEqual({ kinds: ["tasks", "meetings"] });
    // A workspace with no live room is a quiet no-op.
    expect(() => new RegistryBus().recordsChanged("no-such-workspace", ["tasks"])).not.toThrow();
  });

  it("uses a wired verifier, and fails closed without one", { timeout: 15000 }, async () => {
    const { testServer } = await setup();
    OfficeRoom.verifier = {
      verify: () =>
        Promise.resolve({ userId: "u1", name: "Wired", workspaceId: WORKSPACE_ID }),
    };
    testServer.sdk.auth.token = "anything";
    const room = await testServer.sdk.joinOrCreate("office", joinOptions("Wired"));
    await room.waitForInitialState();
    expect(serverPlayer(room.sessionId)?.name).toBe("Wired");
    OfficeRoom.verifier = null;
    const prev = process.env.AUTH_MODE;
    process.env.AUTH_MODE = "supabase";
    try {
      testServer.sdk.auth.token = "dev:Maya";
      await expect(testServer.sdk.joinOrCreate("office", joinOptions("Maya"))).rejects.toThrow(
        /unauthorized/,
      );
    } finally {
      if (prev === undefined) delete process.env.AUTH_MODE;
      else process.env.AUTH_MODE = prev;
    }
  });
});
