import { describe, expect, it } from "vitest";
import catalogue from "../catalogue/catalogue.generated.json";
import sprites from "./sprites.generated.json";
import { FURNITURE, OBSTACLES, SPRITES, WORLD, ZONES, partSize, wallPieces, zoneAt } from "./index.js";
import { footprint } from "./compose.js";
import { World } from "./schema.js";

const kindOf = new Map(catalogue.items.map((i) => [i.id, i.kind]));
const inside = (r: { x: number; z: number; w: number; d: number }, slack = 0.01) =>
  r.x >= -slack && r.z >= -slack && r.x + r.w <= WORLD.width + slack && r.z + r.d <= WORLD.depth + slack;
const overlap = (a: { x: number; z: number; w: number; d: number }, b: typeof a, slack = 0.005) =>
  a.x < b.x + b.w - slack && b.x < a.x + a.w - slack && a.z < b.z + b.d - slack && b.z < a.z + a.d - slack;

describe("office world", () => {
  it("matches the schema", () => {
    expect(World.safeParse(WORLD).error?.issues ?? []).toEqual([]);
  });

  it("places only built catalogue parts, inside the floor", () => {
    for (const p of FURNITURE) {
      expect(kindOf.get(p.part), p.part).toBe("part");
      const size = partSize(p.part);
      expect(size, `${p.part} has no build`).toBeDefined();
      if (size) expect(inside(footprint(p, size)), `${p.part} at (${p.x}, ${p.z})`).toBe(true);
    }
  });

  it("places only reference items as sprites, all of which have a sprite image", () => {
    for (const s of SPRITES) {
      expect(kindOf.get(s.ref), s.ref).toBe("reference");
      expect(s.ref in sprites.sprites, s.ref).toBe(true);
    }
  });

  it("keeps floor-standing furniture out of walls and glass", () => {
    const walls = WORLD.walls.flatMap(wallPieces);
    for (const p of FURNITURE.filter((f) => f.y === 0)) {
      const size = partSize(p.part);
      if (!size) continue;
      const box = footprint(p, size);
      for (const w of walls) expect(overlap(box, w), `${p.part} at (${p.x}, ${p.z}) hits ${w.id}`).toBe(false);
    }
  });

  it("gives every glass room a door and cuts it out of the obstacles", () => {
    const rooms = new Map<string, typeof WORLD.walls>();
    for (const wall of WORLD.walls.filter((w) => w.kind === "glass")) {
      const room = wall.id.split(".")[0];
      rooms.set(room, [...(rooms.get(room) ?? []), wall]);
    }
    expect(rooms.size).toBeGreaterThan(0);
    for (const [room, walls] of rooms) {
      expect(walls.reduce((n, w) => n + w.doors.length, 0), room).toBe(1);
      for (const w of walls) expect(wallPieces(w).length, w.id).toBe(w.doors.length + 1);
    }
  });

  it("puts the spawn point on open floor", () => {
    expect(inside({ x: WORLD.spawn.x, z: WORLD.spawn.z, w: 0, d: 0 })).toBe(true);
  });

  it("keeps zones on the floor and finds them by point", () => {
    for (const zone of ZONES) expect(inside(zone), zone.id).toBe(true);
    expect(zoneAt(5, 3)?.id).toBe("meeting_a");
    expect(zoneAt(17, 2)?.type).toBe("customer_room");
    expect(zoneAt(26, 3)?.type).toBe("project_room");
    expect(zoneAt(5, 12)?.type).toBe("kitchen");
    expect(zoneAt(20, 15)?.id).toBe("team_success");
    expect(zoneAt(1.5, 24)?.id).toBe("focus_1");
    expect(zoneAt(14.75, 25)).toBeNull();   // the west street
  });

  it("puts a keyboard set on a desk in front of every desk chair, facing it", () => {
    const desks = OBSTACLES.filter((o) => o.id === "workstation.bench-desk-4");
    expect(WORLD.desktops.length).toBe(desks.length * 4);
    for (const d of WORLD.desktops) {
      expect(desks.some((k) => d.x > k.x && d.x < k.x + k.w && d.z > k.z && d.z < k.z + k.d), `kit at (${d.x}, ${d.z})`).toBe(true);
      const towards = d.rotY === 0 ? 1 : -1;               // the person sits on this side
      const chair = FURNITURE.find((p) => p.part === "seating.task-chair-black"
        && Math.abs(p.x - d.x) < 0.05 && Math.sign(p.z - d.z) === towards && Math.abs(p.z - d.z) < 0.6);
      expect(chair, `chair for the kit at (${d.x}, ${d.z})`).toBeDefined();
    }
  });

  it("leaves corridors of at least 1.5 m between the desk clusters (DESIGN_SPEC 3)", () => {
    const desks = OBSTACLES.filter((o) => o.id === "workstation.bench-desk-4");
    expect(desks.length).toBe(24);
    const reach = 0.9;   // chairs pulled out behind each desk side
    for (let i = 0; i < desks.length; i++) {
      for (let j = i + 1; j < desks.length; j++) {
        const [a, b] = [desks[i], desks[j]];
        const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
        const gapZ = Math.max(b.z - (a.z + a.d), a.z - (b.z + b.d)) - 2 * reach;
        expect(Math.max(gapX, gapZ), `clusters ${i} and ${j}`).toBeGreaterThanOrEqual(1.5);
      }
    }
  });
});
