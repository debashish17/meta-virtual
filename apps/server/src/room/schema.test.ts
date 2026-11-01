import { describe, expect, it } from "vitest";
import type { Schema } from "@colyseus/schema";
import { AvatarLook, NpcView, PlayerActivity, PlayerView } from "@office/shared";
import { ActivityState, LookState, NpcState, PlayerState } from "./schema.js";

/**
 * The schema's field names from its own metadata (`constructor[Symbol.metadata]`, numeric
 * index to `{ name }`). An instance's `Object.keys` would miss them: `@type` keeps values
 * behind prototype accessors.
 */
function fieldNames(klass: typeof Schema): string[] {
  const metadata = (klass as unknown as Record<symbol, Record<string, { name?: unknown }>>)[
    Symbol.metadata
  ];
  return Object.keys(metadata)
    .filter((key) => /^\d+$/.test(key))
    .map((key) => metadata[key].name)
    .filter((name): name is string => typeof name === "string")
    .sort();
}

describe("room schema mirrors the shared state types", () => {
  it("matches PlayerView field for field", () => {
    expect(fieldNames(PlayerState)).toEqual(PlayerView.keyof().options.sort());
  });

  it("matches NpcView field for field", () => {
    expect(fieldNames(NpcState)).toEqual(NpcView.keyof().options.sort());
  });

  it("matches the nested AvatarLook and PlayerActivity shapes", () => {
    expect(fieldNames(LookState)).toEqual(AvatarLook.keyof().options.sort());
    expect(fieldNames(ActivityState)).toEqual(PlayerActivity.keyof().options.sort());
  });

  it("holds a spawned player, mapping back to PlayerView", () => {
    const player = new PlayerState();
    player.id = "s1";
    player.userId = "u1";
    player.name = "Maya";
    Object.assign(player.look, {
      body: "casual",
      top: "#f2f2ef",
      accent: "#f2f2ef",
      bottom: "#34495e",
      shoes: "#24262a",
      height: 1.68,
    });
    player.x = 1.5;
    player.z = 2.5;
    player.pose = "stand";
    player.activity.kind = "";
    player.activity.targetId = "";
    player.status = "available";
    player.zoneId = "";
    player.lastSeq = 0;
    // The wire form maps back: "" means no zone and no activity (both null).
    const view = {
      id: player.id,
      userId: player.userId,
      name: player.name,
      look: {
        body: player.look.body,
        top: player.look.top,
        accent: player.look.accent,
        bottom: player.look.bottom,
        shoes: player.look.shoes,
        height: player.look.height,
      },
      x: player.x,
      z: player.z,
      facing: player.facing,
      pose: player.pose,
      speed: player.speed,
      activity: null,
      status: player.status,
      zoneId: null,
      lastSeq: player.lastSeq,
    };
    expect(PlayerView.safeParse(view).success).toBe(true);
  });
});
