import { afterEach, describe, expect, it } from "vitest";
import { Server } from "@colyseus/core";
import { ColyseusTestServer } from "@colyseus/testing";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { OFFICE_WALK, PROTOCOL_VERSION, WORKSPACE_ID, WORLD, zoneAt } from "@office/shared";
import { OfficeRoom } from "../room/office.room.js";
import { getRoom } from "../room/rooms.js";
import {
  CAPTION_RATE_MAX,
  NO_SPEECH_NOTICE,
  TRANSCRIPT_SEGMENTS_MAX,
  TranscriptBuffer,
  assembleTranscript,
  registerCaptionHandlers,
} from "./transcript.js";

// P5-C verification harness, saved to /tmp because P5-C owns only `transcript.ts` on the
// server (see docs/reports/P5-C.md request R4). Restore as
// `apps/server/src/calls/transcript.test.ts` to re-run: 7/7 green on 2026-11-02
// (log: /tmp/p5c-harness.log). R1 is now wired into OfficeRoom.onCreate, so these
// tests drive the real production room directly (no subclass, no manual
// registration — composing twice would double-broadcast every caption).

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

function joinOptions(displayName: string) {
  return {
    protocol: PROTOCOL_VERSION,
    displayName,
    workspaceId: WORKSPACE_ID,
    look: { ...LOOK },
  };
}

type TestRoom = Awaited<ReturnType<ColyseusTestServer["sdk"]["joinOrCreate"]>>;

/** The production room's caption buffer, reached through the registry (R1 wires it). */
function buffers(): TranscriptBuffer | null {
  const room = getRoom(WORKSPACE_ID) as unknown as { captions?: TranscriptBuffer } | undefined;
  return room?.captions ?? null;
}

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
    await sleep(25);
  }
}

const SPAWN = { x: WORLD.spawn.x, z: WORLD.spawn.z };

/** A reachable point in a zone other than the spawn's, with its route length in metres. */
function otherZoneTarget(): { x: number; z: number; zoneId: string } {
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
      if (OFFICE_WALK.findPath(SPAWN, q).length === 0) continue;
      return { x: q.x, z: q.z, zoneId: zid };
    }
  }
  throw new Error("no reachable zone found");
}

function serverZone(sessionId: string): string | null {
  return getRoom(WORKSPACE_ID)?.state.players.get(sessionId)?.zoneId ?? null;
}

interface SeenCaption {
  name: string;
  text: string;
  final: boolean;
  ts: number;
}

function listen(room: TestRoom): { captions: SeenCaption[]; errors: { code: string }[] } {
  const captions: SeenCaption[] = [];
  const errors: { code: string }[] = [];
  room.onMessage("caption", (message: unknown) => {
    captions.push(message as SeenCaption);
  });
  room.onMessage("error", (message: unknown) => {
    errors.push(message as { code: string });
  });
  return { captions, errors };
}

describe("caption transport", () => {
  let gameServer: Server | null = null;
  let testServer: ColyseusTestServer | null = null;

  // The axm: filter above stays installed for the worker's whole life (see
  // server.test.ts): restoring it around cleanup lets a late pm2 monitor
  // message crash the runner after the tests pass.
  afterEach(async () => {
    if (testServer) {
      await testServer.cleanup().catch(() => undefined);
      testServer = null;
    }
    if (gameServer) {
      await gameServer.gracefullyShutdown(false).catch(() => undefined);
      gameServer = null;
    }
  });

  it("broadcasts a caption to the speaker's zone with the speaker's name", async () => {
    ({ gameServer, testServer } = await boot());
    const maya = await join(testServer, "Maya");
    const arjun = await join(testServer, "Arjun");
    const heardMaya = listen(maya);
    const heardArjun = listen(arjun);

    maya.send("caption_send", { text: "moving go-live", final: false, ts: 11 });
    await waitFor(() => heardArjun.captions.length === 1, 5000, "arjun's caption");
    await waitFor(() => heardMaya.captions.length === 1, 5000, "maya's own caption");

    expect(heardArjun.captions[0]).toEqual({ name: "Maya", text: "moving go-live", final: false, ts: 11 });
    expect(heardMaya.captions[0]).toEqual({ name: "Maya", text: "moving go-live", final: false, ts: 11 });
    // Interim segments are broadcast but never buffered.
    expect(buffers()?.transcript("")).toBe("");
  });

  it("scopes broadcasts and buffers by zone", async () => {
    ({ gameServer, testServer } = await boot());
    const maya = await join(testServer, "Maya");
    const arjun = await join(testServer, "Arjun");
    // Arjun walks to the nearest other zone through the real move path, so the
    // room's own zone tracking (not a test poke the tick would revert) scopes him.
    const target = otherZoneTarget();
    arjun.send("move_target", { seq: 1, x: target.x, z: target.z });
    await waitFor(
      () => serverZone(arjun.sessionId) === target.zoneId,
      60000,
      `arjun reaching ${target.zoneId}`,
    );
    expect(serverZone(maya.sessionId)).not.toBe(target.zoneId);
    const heardMaya = listen(maya);
    const heardArjun = listen(arjun);
    const home = serverZone(maya.sessionId) ?? "";

    maya.send("caption_send", { text: "from the floor", final: true, ts: 21 });
    await waitFor(() => heardMaya.captions.length === 1, 5000, "maya's caption");
    await sleep(300);
    expect(heardArjun.captions).toEqual([]);

    arjun.send("caption_send", { text: "from afar", final: true, ts: 22 });
    await waitFor(() => heardArjun.captions.length === 1, 5000, "arjun's caption");
    await sleep(300);
    expect(heardMaya.captions).toHaveLength(1);

    expect(buffers()?.transcript(home)).toBe("Maya: from the floor");
    expect(buffers()?.transcript(target.zoneId)).toBe("Arjun: from afar");
  });

  it("assembles final segments with speaker names and takes them once", async () => {
    ({ gameServer, testServer } = await boot());
    const maya = await join(testServer, "Maya");
    const arjun = await join(testServer, "Arjun");
    listen(maya);
    listen(arjun);

    maya.send("caption_send", { text: "go-live moves", final: true, ts: 31 });
    arjun.send("caption_send", { text: "i will take the webhook", final: true, ts: 32 });
    await waitFor(
      () => (buffers()?.isEmpty("") ?? true) === false,
      5000,
      "buffered finals",
    );
    await waitFor(
      () => buffers()?.transcript("").split("\n").length === 2,
      5000,
      "both finals",
    );
    expect(buffers()?.transcript("")).toBe(
      "Maya: go-live moves\nArjun: i will take the webhook",
    );
    expect(buffers()?.take("")).toBe(
      "Maya: go-live moves\nArjun: i will take the webhook",
    );
    expect(buffers()?.isEmpty("")).toBe(true);
    expect(buffers()?.take("")).toBeNull();
    expect(NO_SPEECH_NOTICE).toBe("no speech was captured");
  });

  it("rejects invalid captions and rate-limits floods", async () => {
    ({ gameServer, testServer } = await boot());
    const maya = await join(testServer, "Maya");
    const arjun = await join(testServer, "Arjun");
    const heardMaya = listen(maya);
    const heardArjun = listen(arjun);

    maya.send("caption_send", { text: "   ", final: true, ts: 41 });
    await waitFor(() => heardMaya.errors.length === 1, 5000, "invalid_message");
    expect(heardMaya.errors[0].code).toBe("invalid_message");
    await sleep(300);
    expect(heardArjun.captions).toEqual([]);

    for (let i = 0; i < CAPTION_RATE_MAX + 5; i += 1) {
      arjun.send("caption_send", { text: `flood ${i}`, final: false, ts: 100 + i });
    }
    await waitFor(
      () => heardArjun.errors.some((e) => e.code === "rate_limited"),
      5000,
      "rate_limited",
    );
  });

  it("ignores senders the room does not know, without crashing", () => {
    const sent: { type: string; message: unknown }[] = [];
    const handlers = new Map<string, (client: never, message: unknown) => void>();
    const buffers = new TranscriptBuffer();
    const room = {
      onMessage: (type: string, cb: (client: never, message: unknown) => void) => {
        handlers.set(type, cb);
      },
      clients: [],
      state: { players: new Map() },
    };
    const returned = registerCaptionHandlers(room, buffers);
    expect(returned).toBe(buffers);
    const handler = handlers.get("caption_send");
    expect(handler).toBeDefined();
    handler?.({ sessionId: "ghost", send: () => undefined } as never, {
      text: "boo",
      final: true,
      ts: 1,
    });
    expect(sent).toEqual([]);
    expect(buffers.isEmpty("")).toBe(true);
  });
});

describe("TranscriptBuffer", () => {
  it("formats lines as speaker-prefixed text in arrival order", () => {
    expect(
      assembleTranscript([
        { name: "Maya", text: "one", ts: 2 },
        { name: "Arjun", text: "two", ts: 1 },
      ]),
    ).toBe("Maya: one\nArjun: two");
    expect(assembleTranscript([])).toBe("");
  });

  it("caps each zone's buffer at the newest segments", () => {
    const buffers = new TranscriptBuffer();
    for (let i = 0; i < TRANSCRIPT_SEGMENTS_MAX + 10; i += 1) {
      buffers.addFinal("", { name: "Maya", text: `line ${i}`, ts: i });
    }
    const lines = buffers.transcript("").split("\n");
    expect(lines).toHaveLength(TRANSCRIPT_SEGMENTS_MAX);
    expect(lines[0]).toBe("Maya: line 10");
    buffers.clear("");
    expect(buffers.isEmpty("")).toBe(true);
    expect(buffers.transcript("")).toBe("");
  });
});
