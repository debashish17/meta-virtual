import { around, COUNTER_TOP, DESK_TOP, TABLE_TOP, desk } from "../layouts/helpers.js";
import type { LayoutPart } from "../layouts/schema.js";
import { isoWidth, part, placeLayout, sprite } from "./compose.js";
import type { Desktop, Finish, FloorPatch, SpriteProp, Wall, World, Zone, ZoneType } from "./schema.js";

/**
 * The office floor: 64 x 40 m on one level, seen from the south-west, laid out on streets.
 * A wood-floored corridor runs in front of the rooms on the north wall and a main street crosses
 * the floor from the café to the windows; three cross streets join them and lead to the entrance
 * in the south wall. Four team neighbourhoods sit on their own carpet between the streets. The
 * west side holds the café, the library with its focus rooms, and reception; the east side, along
 * the floor-to-ceiling glass, a window lounge and the town hall. The rooms on the north wall come
 * in groups with open bays between them (ideas wall, print hub, tea point); focus and huddle rooms
 * sit with the library and the quiet corner. The south and west edges are low walls so the camera
 * sees in. Furniture is built catalogue parts, mostly whole board layouts; small props are
 * reference sprites.
 */

const W = 64;
const D = 40;
const WALL_H = 3.2;
const SOLID_T = 0.12;
const GLASS_T = 0.06;
const DOOR = 1.0;

// streets
const CORRIDOR = { z: 6.5, d: 2.5 };                       // along the north rooms
const MAIN = { z: 19.5, d: 3 };                            // café to windows
const CROSS = [{ x: 13.5, w: 2.5 }, { x: 33.5, w: 2.5 }, { x: 53.5, w: 2.5 }];   // north-south
const ENTRANCE = CROSS[0];                                 // the west street ends at the way in
const PORTAL = { x: ENTRANCE.x + ENTRANCE.w / 2, w: 4.2 }  // the entry's doors and side panels, centred on that street
const WINDOW_SIDE = 56;                                    // x where the window lounge and town hall begin

const mm = (v: number) => Math.round(v * 1000) / 1000;
const isWallPanel = (id: string) => id === "partition.solid-wall-panel";

/** z (or x) of a wall-mounted sprite in front of a wall face, clear of it once turned to the camera. */
const offWall = (face: number, width: number, dir: 1 | -1 = 1) => face + dir * (width / 2 * Math.SQRT1_2 + 0.01);

// ---------------------------------------------------------------- rooms

type Side = "north" | "south" | "west" | "east";
type Rect = { x: number; z: number; w: number; d: number };
type Room = Rect & {
  id: string; name: string; type: ZoneType;
  door?: { side: Side; at: number };   // offset from the face's west or north end; no door = no walls (a booth)
  fill: (r: Rect) => LayoutPart[];
  props?: (r: Rect) => SpriteProp[];
};

/** Table, chairs and a credenza under the TV, for the rooms on the north wall (doors at the west end). */
const conference = (chair: string, tv: string) => (r: Rect): LayoutPart[] => {
  const [cx, cz] = [r.x + r.w / 2, r.z + r.d / 2 + 0.1];
  return [
    part("meeting.conference-table-10", cx, cz),
    ...around(chair, cx, cz, { w: 3.2, d: 1.2 }, { along: [-1.2, -0.4, 0.4, 1.2], ends: true }),
    part("storage.credenza-low", cx, r.z + 0.2),
    part(tv, cx, r.z + 0.1, 0, 0.95),
    part("tech.wall-whiteboard", r.x + 1.2, r.z + 0.035, 0, 0.95),
    part("greenery.large-plant", r.x + r.w - 0.65, r.z + 0.6),
    part("greenery.plant-medium", r.x + r.w - 0.5, r.z + r.d - 0.45),
  ];
};

const tableForSix = (r: Rect): LayoutPart[] => {
  const [cx, cz] = [r.x + r.w / 2, r.z + r.d / 2 + 0.2];
  return [
    part("meeting.rectangular-table-6", cx, cz),
    ...around("seating.task-chair-black", cx, cz, { w: 2.0, d: 1.0 }, { along: [-0.65, 0, 0.65] }),
  ];
};

const meetingTable = (r: Rect): LayoutPart[] => [
  ...tableForSix(r),
  part("tech.tv-display-55", r.x + r.w / 2 - 0.8, r.z + 0.1, 0, 0.95),
  part("tech.wall-board", r.x + r.w / 2 + 1.0, r.z + 0.035, 0, 0.9),
  part("greenery.plant-medium", r.x + r.w - 0.5, r.z + 0.45),
];

const projectRoom = (r: Rect): LayoutPart[] => [
  ...tableForSix(r),
  part("tech.tv-display-65", r.x + 2.5, r.z + 0.1, 0, 0.95),
  part("tech.wall-board", r.x + 5.0, r.z + 0.035, 0, 0.9),
  part("tech.cork-board-1200x900", r.x + 6.5, r.z + 0.015, 0, 0.95),
  part("tech.mobile-whiteboard", r.x + r.w - 0.75, r.z + 2.5, 270),
  part("greenery.plant-medium", r.x + r.w - 0.6, r.z + r.d - 0.45),
];

const customerRoom = (r: Rect): LayoutPart[] => [
  ...placeLayout("workstation.executive-desk", r.x + 4.6, r.z + 1.45),
  part("meeting.round-table-4", r.x + 2.2, r.z + 3.6),
  ...around("seating.visitor-chair", r.x + 2.2, r.z + 3.6, { w: 1.0, d: 1.0 }, { along: [0], ends: true }),
  part("tech.tv-display-55", r.x + 2.2, r.z + 0.1, 0, 0.95),
  part("storage.bookshelf", r.x + r.w - 0.24, r.z + 4.4, 270),
  part("greenery.large-floor-plant", r.x + 0.6, r.z + 0.6),
];

/** One desk against the north face; the door is in the east face. */
const focusRoom = (r: Rect): LayoutPart[] => [
  ...desk(r.x + 1.3, r.z + 0.75, 1, { pedestal: 1, plant: -1 }),
  part("lighting.floor-lamp", r.x + 2.6, r.z + 0.5),
  part("greenery.plant-medium", r.x + 0.45, r.z + r.d - 0.45),
];

/** Round table for three or four; the door is in the north face. */
const huddle = (r: Rect): LayoutPart[] => {
  const [cx, cz] = [r.x + r.w / 2, r.z + r.d / 2 + 0.2];
  return [
    part("meeting.round-table-4", cx, cz),
    ...around("seating.task-chair-grey", cx, cz, { w: 1.0, d: 1.0 }, { along: [0], back: false, ends: true }),
    part("greenery.table-plant", cx, cz, 0, TABLE_TOP),
    part("tech.mobile-whiteboard", r.x + r.w - 0.45, cz, 270),
    part("greenery.plant-medium", r.x + 0.45, r.z + r.d - 0.45),
  ];
};

const booth = (r: Rect): LayoutPart[] => [part("architecture.phone-booth", r.x + r.w / 2, r.z + 0.6)];

const ROOMS: Room[] = [
  // north wall, west group: the reference's meeting room, phone pods and glass office
  { id: "meeting_a", name: "Meeting room A", type: "meeting_room", x: 0.5, z: 0, w: 8, d: 6.5,
    door: { side: "south", at: 0.6 }, fill: conference("seating.conference-chair", "tech.tv-display-65"),
    props: (r) => [
      sprite("tech.video-conference-speaker", r.x + r.w / 2, r.z + r.d / 2 + 0.1, isoWidth(0.2, 0.2), TABLE_TOP),
      sprite("tech.speaker-bar", r.x + r.w / 2, r.z + 0.25, isoWidth(0.7, 0.1), 0.75),
      sprite("tech.conference-camera", r.x + r.w / 2, r.z + 0.12, isoWidth(0.2, 0.1), 1.82),
    ] },
  { id: "pod_1", name: "Phone pod", type: "meeting_room", x: 8.8, z: 0, w: 1.2, d: 2, fill: booth },
  { id: "pod_2", name: "Phone pod", type: "meeting_room", x: 10.0, z: 0, w: 1.2, d: 2, fill: booth },
  { id: "acme_room", name: "Acme room", type: "customer_room", x: 11.5, z: 0, w: 7, d: 6.5,
    door: { side: "south", at: 0.6 }, fill: customerRoom,
    props: (r) => [sprite("decor.laptop-open", r.x + 2.2, r.z + 3.6, isoWidth(0.32, 0.22), TABLE_TOP)] },
  // north wall, between the ideas wall, the print hub and the tea point
  { id: "project_room", name: "Project room", type: "project_room", x: 25, z: 0, w: 8, d: 6.5,
    door: { side: "south", at: 0.6 }, fill: projectRoom },
  { id: "meeting_b", name: "Meeting room B", type: "meeting_room", x: 39.5, z: 0, w: 7, d: 6.5,
    door: { side: "south", at: 0.6 }, fill: meetingTable },
  // the corner where the north wall meets the windows
  { id: "boardroom", name: "Boardroom", type: "meeting_room", x: WINDOW_SIDE, z: 0, w: W - WINDOW_SIDE, d: 7,
    door: { side: "south", at: 0.6 }, fill: conference("seating.executive-chair", "tech.tv-display-75") },
  // quiet rooms off the library, along the west edge
  ...[0, 1, 2].map((i): Room => ({ id: `focus_${i + 1}`, name: `Focus room ${i + 1}`, type: "meeting_room",
    x: 0.3, z: mm(23 + i * 3.1), w: 3.3, d: 3.1, door: { side: "east", at: 1.05 }, fill: focusRoom })),
  // huddle rooms in the quiet corner, at the south edge
  ...[0, 1].map((i): Room => ({ id: `huddle_${i + 1}`, name: `Huddle room ${i + 1}`, type: "meeting_room",
    x: mm(36.5 + i * 3.6), z: 35.2, w: 3.6, d: 4.5, door: { side: "north", at: 0.4 }, fill: huddle })),
];

/** Glass on every face that is not the building's north wall or window; a face shared with the
 * room next door is built once. */
function roomWalls(rooms: Room[]): Wall[] {
  const walls: Wall[] = [];
  const built = new Set<string>();
  for (const r of rooms) {
    if (!r.door) continue;
    const [x0, z0, x1, z1] = [r.x, r.z, mm(r.x + r.w), mm(r.z + r.d)];
    const faces: [Side, [number, number], [number, number]][] = [
      ["north", [x0, z0], [x1, z0]], ["south", [x0, z1], [x1, z1]],
      ["west", [x0, z0], [x0, z1]], ["east", [x1, z0], [x1, z1]],
    ];
    for (const [side, from, to] of faces) {
      if ((side === "north" && z0 <= 0) || (side === "east" && x1 >= W)) continue;
      const key = `${from}:${to}`;
      if (built.has(key)) continue;
      built.add(key);
      walls.push({ id: `${r.id}.${side}`, kind: "glass", from, to, height: WALL_H, thickness: GLASS_T,
        doors: r.door.side === side ? [{ at: r.door.at, width: DOOR }] : [] });
    }
  }
  return walls;
}

// ---------------------------------------------------------------- bays on the north wall

// Layouts against the north wall: their back edge on the wall's face (z = 0).
const ideasWall: LayoutPart[] = [
  ...placeLayout("tech.collaboration-wall", 21.75, 0.5, 0, isWallPanel),
  ...placeLayout("lounge.high-table-set", 21.6, 3.8),
  part("tech.mobile-whiteboard", 24.2, 3.6, 270),
];

const printHub: LayoutPart[] = [
  ...placeLayout("utility.multi-printer-setup", 36.25, 0.35),
  ...placeLayout("utility.print-plus-supply-island", 36.25, 3.4),
];

const teaPoint: LayoutPart[] = [
  ...placeLayout("kitchen.compact-kitchenette", 47.9, 0.3, 0, isWallPanel),
  ...placeLayout("kitchen.water-and-snacks-station", 50.5, 0.3, 0, isWallPanel),
  ...placeLayout("lounge.high-table-set", 50.0, 3.6),
  ...placeLayout("lounge.open-lounge-set", 53.6, 3.4),
  part("greenery.large-plant", 55.4, 0.6),
];

// ---------------------------------------------------------------- team neighbourhoods

const deskProps = (cx: number, cz: number): SpriteProp[] => [
  sprite("decor.mug", cx - 0.25, cz + 0.6, 0.09, DESK_TOP),
  sprite("decor.notebook", cx + 1.12, cz - 0.55, 0.2, DESK_TOP),
  sprite("decor.headphones", cx + 1.15, cz + 0.45, isoWidth(0.18, 0.18), DESK_TOP),
  sprite("decor.water-bottle", cx - 1.15, cz - 0.5, 0.07, DESK_TOP),
];

/** Keyboard, mouse and mat in front of each of the four places (seat lines 0.35 m either side of
 * the desk's centre, keyboards between the monitor and the desk's edge). */
const deskTops = (cx: number, cz: number): Desktop[] => [-0.7, 0.7].flatMap((dx) => [
  { x: mm(cx + dx), z: mm(cz + 0.5), rotY: 0 as const },
  { x: mm(cx + dx), z: mm(cz - 0.5), rotY: 180 as const },
]);

const cluster = (x: number, z: number) => ({
  parts: [...placeLayout("workstation.benching-4-seater", x, z), part("utility.trash-bin-black", x + 1.65, z)],
  props: deskProps(x, z),
  desktops: deskTops(x, z),
});

type Team = Rect & {
  id: string; name: string; carpet: Finish;
  rows: [number, number];              // z of the two rows of desk clusters
  lockers: "west" | "east";            // the end on a cross street; the team table is at the other end
  edges: number[];                     // z of planter lines along the streets
};

const CLUSTER_W = 2.8;
const CLUSTER_GAP = 1.5;
const LOCKER_AISLE = 1.8;              // from the team's end to its first cluster

function team(t: Team) {
  const dir = t.lockers === "west" ? 1 : -1;
  const end = t.lockers === "west" ? t.x : t.x + t.w;
  const xs = [0, 1, 2].map((i) => end + dir * (LOCKER_AISLE + CLUSTER_W / 2 + i * (CLUSTER_W + CLUSTER_GAP)));
  const clusters = t.rows.flatMap((z) => xs.map((x) => cluster(x, z)));
  const tx = t.lockers === "west" ? t.x + t.w - 2.15 : t.x + 2.15;     // the team table
  const plantX = t.lockers === "west" ? t.x + t.w - 0.5 : t.x + 0.5;
  return {
    parts: [
      ...clusters.flatMap((c) => c.parts),
      ...t.rows.flatMap((z) => [
        // doors to the west whichever end they stand at, so the camera sees them
        ...[-0.3, 0.3].map((dz) => part("storage.small-locker-2x2", end + dir * 0.25, z + dz, 270)),
        part("greenery.plant-small", end + dir * 0.25, z + 0.3, 0, 0.9),
      ]),
      ...t.edges.flatMap((z) => xs.map((x) => part("greenery.planter-box-low", x, z))),
      part("meeting.round-table-6", tx, t.rows[0]),
      ...around("seating.task-chair-grey", tx, t.rows[0], { w: 1.4, d: 1.4 }, { along: [0], ends: true }),
      part("greenery.table-plant", tx, t.rows[0], 0, TABLE_TOP),
      part("tech.mobile-whiteboard", tx, t.rows[1] - 0.4),
      part("storage.credenza-low", tx, t.rows[1] + 1.0),
      part("utility.a4-desk-printer", tx - 0.35, t.rows[1] + 1.0, 0, DESK_TOP),
      part("greenery.plant-small", tx + 0.5, t.rows[1] + 1.0, 0, DESK_TOP),
      part("greenery.large-plant", plantX, t.z + 0.6),
      part("greenery.large-floor-plant", plantX, t.z + t.d - 0.6),
    ],
    props: [
      ...clusters.flatMap((c) => c.props),
      sprite("utility.paper-ream", tx + 0.05, t.rows[1] + 1.0, 0.3, DESK_TOP),
    ],
    desktops: clusters.flatMap((c) => c.desktops),
  };
}

const NORTH = { z: CORRIDOR.z + CORRIDOR.d, d: MAIN.z - (CORRIDOR.z + CORRIDOR.d) };   // 9 .. 19.5
const SOUTH = { z: MAIN.z + MAIN.d, d: 10 };                                          // 22.5 .. 32.5
const WEST_TEAMS = { x: CROSS[0].x + CROSS[0].w, w: CROSS[1].x - (CROSS[0].x + CROSS[0].w) };   // 16 .. 33.5
const EAST_TEAMS = { x: CROSS[1].x + CROSS[1].w, w: CROSS[2].x - (CROSS[1].x + CROSS[1].w) };   // 36 .. 53.5
const northRows: [number, number] = [NORTH.z + 3.0, NORTH.z + 7.8];
const southRows: [number, number] = [SOUTH.z + 2.8, SOUTH.z + 7.6];
const northEdges = [NORTH.z + 0.35, NORTH.z + NORTH.d - 0.35];
const southEdges = [SOUTH.z + 0.35];

const TEAMS: Team[] = [
  { id: "team_success", name: "Customer success", ...WEST_TEAMS, ...NORTH, carpet: "carpet_slate", rows: northRows, lockers: "west", edges: northEdges },
  { id: "team_integrations", name: "Integrations", ...EAST_TEAMS, ...NORTH, carpet: "carpet_sage", rows: northRows, lockers: "east", edges: northEdges },
  { id: "team_product", name: "Product & design", ...WEST_TEAMS, ...SOUTH, carpet: "carpet_sand", rows: southRows, lockers: "west", edges: southEdges },
  { id: "team_platform", name: "Platform", ...EAST_TEAMS, ...SOUTH, carpet: "carpet_stone", rows: southRows, lockers: "east", edges: southEdges },
];
const teams = TEAMS.map(team);

// ---------------------------------------------------------------- west side: café, library, reception

const KITCHEN_Z = CORRIDOR.z + CORRIDOR.d;              // the kitchen wall stands on the corridor's edge
const NOOK_X = 10.4;                                    // and returns here, so the kitchenette sits in a nook
const counter = KITCHEN_Z + SOLID_T / 2 + 0.3;          // cabinet centre line against the kitchen wall
const cafe: LayoutPart[] = [
  ...placeLayout("kitchen.standard-kitchenette", 2.4, counter, 0, isWallPanel),
  ...placeLayout("kitchen.coffee-bar", 5.4, counter, 0, isWallPanel),
  ...placeLayout("kitchen.water-and-snacks-station", 7.8, counter, 0, isWallPanel),
  part("greenery.large-plant", 9.7, 9.65),
  part("kitchen.counter-table", 4.5, 11.8),
  ...[3.75, 4.25, 4.75, 5.25].map((x) => part("seating.bar-stool-backless", x, 12.3, 180)),
  ...[3.0, 7.4].flatMap((x) => [part("kitchen.dining-table-6", x, 15.2),
    ...around("seating.visitor-chair", x, 15.2, { w: 1.8, d: 0.9 }, { along: [-0.6, 0, 0.6] })]),
  ...[12.6, 16.4].flatMap((z) => [part("kitchen.dining-table-4", 11.6, z),
    ...around("seating.visitor-chair", 11.6, z, { w: 1.0, d: 1.0 }, { along: [0], ends: true })]),
  ...placeLayout("lounge.open-lounge-set", 2.8, 18.4),
  part("greenery.large-plant", 0.6, 16.9),
  part("greenery.plant-medium", 12.9, 18.9),
];

const library: LayoutPart[] = [
  // shelves along the main street, backs to it
  ...[4.8, 5.6, 6.4].map((x) => part("storage.bookcase-tall", x, 22.85)),
  part("greenery.plant-medium", 7.3, 22.9),
  ...[8.2, 9.2, 10.2].map((x) => part("storage.bookshelf", x, 22.85)),
  ...[11.1, 11.9].map((x) => part("storage.bookcase-tall", x, 22.85)),
  part("greenery.large-plant", 12.9, 23.0),
  // reading corner, nook and table
  part("lounge.rug-dark", 7.0, 26.2, 90),
  ...placeLayout("lounge.open-lounge-set", 7.0, 26.2),
  part("lighting.floor-lamp", 5.3, 25.4),
  ...placeLayout("lounge.open-focus-nook", 11.3, 26.0),
  part("meeting.rectangular-table-6", 8.5, 30.0),
  ...around("seating.visitor-chair", 8.5, 30.0, { w: 2.0, d: 1.0 }, { along: [-0.5, 0.5] }),
  ...[8.0, 9.0].map((x) => part("lighting.desk-lamp", x, 30.0, 0, TABLE_TOP)),
  part("greenery.plant-medium", 4.4, 32.0),
  part("greenery.plant-medium", 12.9, 32.0),
];

/** The way in (Doors board, "Double Door Entry"): glass double doors between solid panels standing
 * in the low south wall, tall plants either side inside. */
const entrance: LayoutPart[] = [
  ...placeLayout("architecture.double-door-entry", PORTAL.x, D - 0.5, 180, (id) => id.startsWith("greenery.")),
  part("greenery.large-floor-plant", PORTAL.x - 1.55, D - 0.75),
  part("greenery.large-floor-plant", PORTAL.x + 1.55, D - 0.75),
];

const reception: LayoutPart[] = [
  ...placeLayout("workstation.executive-desk", 10.2, 36.2, 90),     // facing the way in
  part("lounge.rug-neutral", 4.0, 36.4),
  ...placeLayout("lounge.sofa-plus-chair-set", 4.0, 36.4),
  part("greenery.large-floor-plant", 1.0, 33.4),
  part("greenery.plant-medium", 7.0, 39.4),
];

// ---------------------------------------------------------------- south edge: break-out and quiet corner

const breakout: LayoutPart[] = [
  part("lounge.rug-pattern", 19.5, 36.0, 90),
  ...placeLayout("lounge.open-lounge-set", 19.5, 36.0),
  ...placeLayout("lounge.high-table-set", 24.5, 35.4),
  part("lounge.rug-neutral", 29.5, 36.4),
  ...placeLayout("lounge.sofa-plus-chair-set", 29.5, 36.4),
  part("greenery.large-plant", 16.6, 33.2),
  part("greenery.plant-medium", 24.5, 38.8),
  part("greenery.large-floor-plant", 33.0, 39.3),
];

const quietCorner: LayoutPart[] = [
  ...[34.0, 35.3, 36.6].map((z) => part("architecture.phone-booth", 52.9, z, 270)),
  ...placeLayout("lounge.casual-meeting-set", 47.5, 35.6),
  ...placeLayout("lounge.open-focus-nook", 47.5, 38.6),
  part("greenery.large-plant", 44.6, 33.4),
  part("greenery.large-floor-plant", 52.9, 39.2),
];

// ---------------------------------------------------------------- east side, along the windows

const windowLounge: LayoutPart[] = [
  ...[8.4, 9.9, 11.4, 12.9].map((z) => part("workstation.standing-desk", 63.25, z, 270)),
  ...placeLayout("lounge.casual-meeting-set", 58.6, 11.0),
  part("lounge.rug-neutral", 61.8, 16.6, 90),
  part("lounge.3-seater-sofa", 63.4, 16.6, 270),
  part("lounge.rectangular-coffee-table", 62.2, 16.6, 90),
  part("lounge.lounge-chair-fabric", 60.9, 15.9, 90),
  part("lounge.lounge-chair-fabric", 60.9, 17.3, 90),
  part("greenery.large-plant", 63.3, 14.4),
  part("greenery.large-floor-plant", 63.3, 18.9),
];

const townHall: LayoutPart[] = [
  ...placeLayout("tech.presentation-corner", 60.0, 23.3),
  ...[25.8, 26.9, 28.0, 29.1].flatMap((z) => [57.2, 58.05, 58.9, 61.1, 61.95, 62.8].map((x) => part("seating.conference-chair", x, z, 180))),
  part("greenery.large-plant", 56.6, 23.2),
  // the reference's window corner: metal shelving, a printer table and big plants
  part("greenery.large-floor-plant", 63.3, 30.6),
  part("storage.utility-shelf-metal", 63.55, 32.0, 270),
  part("storage.storage-cabinet-low", 63.6, 33.6, 270),
  part("utility.a4-desk-printer", 63.6, 33.7, 270, DESK_TOP),
  part("greenery.large-plant", 63.3, 35.2),
  ...placeLayout("lounge.sofa-plus-chair-set", 62.3, 38.2, 270),
  part("greenery.plant-medium", 57.0, 39.3),
];

// ---------------------------------------------------------------- assembled

const zone = (id: string, name: string, type: ZoneType, x: number, z: number, w: number, d: number): Zone => ({ id, name, type, x, z, w, d });
const patch = (finish: Finish, x: number, z: number, w: number, d: number): FloorPatch => ({ finish, x, z, w, d });
const westW = CROSS[0].x;

export const OFFICE: World = {
  width: W,
  depth: D,
  wallHeight: WALL_H,
  spawn: { x: ENTRANCE.x + ENTRANCE.w / 2, z: D - 2.6 },   // just inside, past the mat, where the doors do not hide you
  zones: [
    ...ROOMS.map((r) => zone(r.id, r.name, r.type, r.x, r.z, r.w, r.d)),
    zone("ideas_wall", "Ideas wall", "open_plan", 18.5, 0, 6.5, CORRIDOR.z),
    zone("print_hub", "Print hub", "open_plan", 33, 0, 6.5, CORRIDOR.z),
    zone("tea_point", "Tea point", "kitchen", 46.5, 0, WINDOW_SIDE - 46.5, CORRIDOR.z),
    zone("cafe", "Café", "kitchen", 0, NORTH.z, westW, NORTH.d),
    zone("library", "Library", "open_plan", 0, SOUTH.z, westW, SOUTH.d),
    zone("reception", "Reception", "open_plan", 0, SOUTH.z + SOUTH.d, westW, D - (SOUTH.z + SOUTH.d)),
    ...TEAMS.map((t) => zone(t.id, t.name, "open_plan", t.x, t.z, t.w, t.d)),
    zone("breakout", "Break-out", "open_plan", WEST_TEAMS.x, SOUTH.z + SOUTH.d, WEST_TEAMS.w, D - (SOUTH.z + SOUTH.d)),
    zone("quiet_corner", "Quiet corner", "open_plan", EAST_TEAMS.x, SOUTH.z + SOUTH.d, EAST_TEAMS.w, D - (SOUTH.z + SOUTH.d)),
    zone("window_lounge", "Window lounge", "open_plan", WINDOW_SIDE, 7, W - WINDOW_SIDE, MAIN.z - 7),
    zone("town_hall", "Town hall", "open_plan", WINDOW_SIDE, SOUTH.z, W - WINDOW_SIDE, D - SOUTH.z),
  ],
  floors: [
    patch("terrazzo", 0, NORTH.z, westW, NORTH.d),                                       // café
    patch("carpet_charcoal", 0, SOUTH.z, westW, SOUTH.d),                                // library
    patch("terrazzo", 0, SOUTH.z + SOUTH.d, westW, D - (SOUTH.z + SOUTH.d)),             // reception
    ...TEAMS.map((t) => patch(t.carpet, t.x, t.z, t.w, t.d)),
    patch("light", WINDOW_SIDE, 7, W - WINDOW_SIDE, D - 7),
    patch("oak", 0, CORRIDOR.z, WINDOW_SIDE, CORRIDOR.d),
    ...CROSS.map((s) => patch("oak", s.x, NORTH.z, s.w, D - NORTH.z)),
    patch("oak", 0, MAIN.z, W, MAIN.d),
    patch("mat", PORTAL.x - 1.0, D - 1.7, 2.0, 1.58),                                    // inside the doors
  ],
  walls: [
    { id: "north", kind: "solid", from: [0, -SOLID_T / 2], to: [W, -SOLID_T / 2], height: WALL_H, thickness: SOLID_T, doors: [] },
    { id: "south", kind: "low", from: [0, D - 0.05], to: [W, D - 0.05], height: 1.0, thickness: 0.1, doors: [{ at: PORTAL.x - PORTAL.w / 2, width: PORTAL.w }] },
    { id: "west", kind: "low", from: [0.05, 0], to: [0.05, D], height: 1.0, thickness: 0.1, doors: [] },
    ...roomWalls(ROOMS),
    { id: "cafe.kitchen", kind: "solid", from: [0.3, KITCHEN_Z], to: [NOOK_X, KITCHEN_Z], height: 2.6, thickness: SOLID_T, doors: [] },
    { id: "cafe.nook", kind: "solid", from: [NOOK_X, KITCHEN_Z], to: [NOOK_X, KITCHEN_Z + 1.8], height: 2.6, thickness: SOLID_T, doors: [] },
  ],
  window: { x: W, from: 0, to: D, mullionEvery: 2 },
  furniture: [
    ...ROOMS.flatMap((r) => r.fill(r)),
    ...ideasWall,
    ...printHub,
    ...teaPoint,
    ...teams.flatMap((t) => t.parts),
    ...cafe,
    ...library,
    ...entrance,
    ...reception,
    ...breakout,
    ...quietCorner,
    ...windowLounge,
    ...townHall,
  ],
  sprites: [
    ...ROOMS.flatMap((r) => r.props?.(r) ?? []),
    ...teams.flatMap((t) => t.props),
    // café counter and wall
    sprite("kitchen.coffee-machine-espresso", 5.6, counter - 0.04, 0.36, COUNTER_TOP),
    sprite("kitchen.coffee-brewer-drip", 4.9, counter - 0.04, 0.26, COUNTER_TOP),
    sprite("kitchen.electric-kettle", 1.9, counter - 0.06, 0.2, COUNTER_TOP),
    sprite("kitchen.fruit-bowl", 3.3, counter + 0.1, 0.26, COUNTER_TOP),
    sprite("kitchen.mug", 6.2, counter + 0.14, 0.09, COUNTER_TOP),
    sprite("kitchen.paper-towels", 0.85, counter - 0.06, 0.12, COUNTER_TOP),
    sprite("kitchen.clock", 8.9, offWall(KITCHEN_Z + SOLID_T / 2, 0.32), 0.32, 2.2),
    sprite("kitchen.wall-art-menu-board", 5.4, offWall(KITCHEN_Z + SOLID_T / 2, 0.6), 0.6, 2.0),
    sprite("kitchen.fruit-bowl", 3.0, 15.2, 0.26, TABLE_TOP),
    sprite("kitchen.napkin-holder", 7.4, 15.2, 0.14, TABLE_TOP),
    sprite("utility.stacked-water-bottles", 9.2, counter + 0.05, isoWidth(0.3, 0.3)),
    sprite("utility.first-aid-kit", 10.0, offWall(KITCHEN_Z + SOLID_T / 2, isoWidth(0.3, 0.2)), isoWidth(0.3, 0.2), 1.45),
    // tea point
    sprite("kitchen.electric-kettle", 47.4, 0.26, 0.2, COUNTER_TOP),
    sprite("kitchen.mug", 48.4, 0.4, 0.09, COUNTER_TOP),
    // library and break-out
    sprite("decor.books-magazine", 7.0, 26.2, 0.3, 0.42),
    sprite("decor.throw-blanket", 6.25, 26.0, 0.35, 0.45),
    sprite("decor.books-magazine", 19.5, 36.0, 0.3, 0.42),
    sprite("lounge.bean-bag-large", 22.2, 38.6, 0.9),
    sprite("lounge.bean-bag-small", 26.8, 38.6, 0.7),
    // reception and entrance
    sprite("tech.room-booking-tablet", 10.2, 35.7, 0.16, DESK_TOP),
    sprite("storage.coat-rack-stand", 12.2, 37.6, isoWidth(0.4, 0.4)),
    sprite("storage.umbrella-stand", 12.3, 38.4, isoWidth(0.3, 0.3)),
    sprite("decor.directory-panel", 17.6, 39.3, isoWidth(0.4, 0.2)),
    sprite("architecture.keycard-reader", PORTAL.x - 1.05, D + 0.08, isoWidth(0.08, 0.04), 1.1),   // outside, by the doors
    // safety and services along the corridor and in the print hub
    ...[8.65, 18.65, 33.15, 46.65].map((x) => sprite("utility.fire-extinguisher", x, CORRIDOR.z + 0.3, isoWidth(0.2, 0.2))),
    sprite("utility.aed-defibrillator", 39.0, offWall(0, isoWidth(0.4, 0.2)), isoWidth(0.4, 0.2), 1.1),
    sprite("utility.water-dispenser", 38.9, 5.6, isoWidth(0.3, 0.3)),
    sprite("utility.water-dispenser", 56.4, 19.1, isoWidth(0.3, 0.3)),
    // window corner printer
    sprite("utility.paper-ream", 63.6, 33.15, 0.3, DESK_TOP, "west"),
  ],
  desktops: teams.flatMap((t) => t.desktops),
};
