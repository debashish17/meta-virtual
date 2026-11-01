import {
  COUNTER_TOP, DESK_TOP, SCREEN_MOUNT, TABLE_TOP, UPPER_CABINET,
  againstBack, around, at, backWall, desk, executiveDesk, glassRoom, place, room,
} from "./helpers.js";
import type { Layout } from "./schema.js";

/**
 * One layout per board composite, arranged after its board picture with built kit parts.
 * Coordinates: see schema.ts. Anything the picture shows that no builder makes yet is listed
 * in `pending` rather than substituted.
 */

const SOLID = "partition.solid-wall-panel";
const GLASS = "partition.full-glass-wall";
const GLASS_DOOR = "partition.glass-wall-with-door";
const CHAIR = "seating.task-chair-black";
const KEYBOARD = "decor.desk-mat-with-keyboard-and-mouse";
// a 65" TV hung on tech.screen-stand: its top meets the top of the 1.8 m uprights, which it hides
const TV_ON_STAND = 0.89;

const entries: Layout[] = [
  // ------------------------------------------------------------------ entries (Doors board)
  {
    id: "architecture.arch-entry",
    footprint: { w: 3.6, d: 1.0 },
    parts: [at(SOLID, -1.2, -0.45), at(SOLID, 1.2, -0.45), at("greenery.plant-medium", -1.3, 0.05)],
    pending: ["architecture.arched-door"],
    note: "The arched door has no builder yet, so the opening is left empty.",
  },
  {
    id: "architecture.double-door-entry",
    footprint: { w: 4.2, d: 1.0 },
    parts: [
      at(SOLID, -1.5, -0.45), at("architecture.glass-door-double", 0, -0.45), at(SOLID, 1.5, -0.45),
      at("greenery.plant-medium", -1.4, 0.1), at("greenery.plant-medium", 1.4, 0.1),
    ],
    pending: [],
  },
  {
    id: "architecture.main-office-entry",
    footprint: { w: 4.2, d: 1.2 },
    parts: [
      at(SOLID, -1.5, -0.55), at("architecture.double-door", 0, -0.55), at(SOLID, 1.5, -0.55),
      at("greenery.large-floor-plant", -1.5, 0.15), at("greenery.large-floor-plant", 1.5, 0.15),
    ],
    pending: [],
  },
  {
    id: "architecture.meeting-room-entry",
    footprint: { w: 3.4, d: 1.0 },
    parts: [at(GLASS, -1.1, -0.45), at("architecture.wood-door-with-vertical-glass", 0, -0.45), at(GLASS, 1.1, -0.45)],
    pending: ["decor.room-sign"],
  },
  {
    id: "architecture.private-room-entry",
    footprint: { w: 3.3, d: 1.0 },
    parts: [
      at(SOLID, -1.05, -0.45), at("architecture.solid-door", 0, -0.45), at("partition.frosted-glass-panel", 1.05, -0.45),
      at("greenery.plant-medium", -1.2, 0.1),
    ],
    pending: [],
  },
  {
    id: "architecture.recessed-entry-niche",
    footprint: { w: 2.4, d: 1.0 },
    parts: [
      at("partition.wood-slat-panel", -0.6, -0.45), at(SOLID, 0.6, -0.45),
      at("storage.wall-shelf-1000x200x300", -0.6, -0.325, 0, 0.45),
      at("greenery.plant-medium", 0.65, -0.1),
    ],
    pending: [],
    note: "The floating bench is the 1000 x 200 wall shelf hung at seat height.",
  },
  {
    id: "architecture.sliding-entry",
    footprint: { w: 4.0, d: 1.0 },
    parts: [at(GLASS, -1.4, -0.45), at("architecture.sliding-glass-door", 0, -0.45), at(GLASS, 1.4, -0.45)],
    pending: [],
  },

  // ------------------------------------------------------------------ kitchens (Kitchenette board)
  {
    id: "kitchen.coffee-bar",
    footprint: { w: 2.4, d: 0.8 },
    parts: [
      ...backWall(2.4, 0.8),
      at("kitchen.drawer-cabinet", -0.9, 0), at("kitchen.base-cabinet", -0.3, 0),
      at("kitchen.base-cabinet", 0.3, 0), at("kitchen.drawer-cabinet", 0.9, 0),
      at("storage.wall-shelf-800x200", -0.7, againstBack(0.8, 0.2), 0, 1.35),
      at("storage.wall-shelf-800x200", -0.7, againstBack(0.8, 0.2), 0, 1.75),
      at("greenery.plant-small", -1.0, 0, 0, COUNTER_TOP),
    ],
    pending: ["kitchen.coffee-machine-espresso", "kitchen.wall-art-menu-board", "kitchen.coffee-beans", "kitchen.mug"],
  },
  {
    id: "kitchen.compact-kitchenette",
    footprint: { w: 2.4, d: 0.8 },
    parts: [
      ...backWall(2.4, 0.8),
      at("kitchen.sink-cabinet", -0.9, 0), at("kitchen.base-cabinet", -0.3, 0),
      at("kitchen.drawer-cabinet", 0.3, 0), at("kitchen.under-counter-fridge", 0.9, 0),
      ...[-0.9, -0.3, 0.3, 0.9].map((x) => at("kitchen.upper-cabinet", x, againstBack(0.8, 0.35), 0, UPPER_CABINET)),
      at("kitchen.microwave", -0.25, -0.05, 0, COUNTER_TOP),
      at("greenery.plant-small", 0.45, -0.1, 0, COUNTER_TOP),
    ],
    pending: ["kitchen.coffee-brewer-drip"],
  },
  {
    id: "kitchen.island-pantry",
    footprint: { w: 3.6, d: 2.8 },
    parts: [
      ...backWall(3.6, 2.8),
      at("kitchen.sink-cabinet", -1.5, -1.0), at("kitchen.base-cabinet", -0.9, -1.0),
      at("kitchen.base-cabinet", -0.3, -1.0), at("kitchen.drawer-cabinet", 0.3, -1.0),
      at("kitchen.full-height-fridge", 0.97, againstBack(2.8, 0.69)),
      at("greenery.plant-medium", 1.45, 0.9),
      at("storage.wall-shelf-1000x200x300", -0.6, againstBack(2.8, 0.2), 0, 1.4),
      at("greenery.plant-small", -1.2, -1.0, 0, COUNTER_TOP),
      at("kitchen.counter-table", -0.3, 0.45),
      ...[-0.9, -0.3, 0.3].map((x) => at("seating.bar-stool-backless", x, 0.95, 180)),
    ],
    pending: ["kitchen.coffee-machine-espresso", "kitchen.fruit-bowl", "lighting.linear-pendant"],
  },
  {
    id: "kitchen.pantry-nook",
    footprint: { w: 2.4, d: 1.4 },
    parts: [
      // corner on the left: a right-hand side wall would hide the nook from the fixed front-right view
      ...room(2.4, 1.4, { back: SOLID, left: SOLID }),
      at("kitchen.sink-cabinet", 0.7, -0.3), at("kitchen.base-cabinet", 0.1, -0.3),
      at("kitchen.corner-cabinet", -0.65, -0.15),
      at("kitchen.microwave", -0.7, -0.35, 0, COUNTER_TOP),
      at("storage.wall-shelf-800x200", 0.5, -0.5, 0, 1.35),
      at("storage.wall-shelf-800x200", 0.5, -0.5, 0, 1.75),
      at("storage.wall-shelf-800x200", -1.0, 0, 90, 1.45),
      at("greenery.plant-small", 0.95, -0.4, 0, COUNTER_TOP),
    ],
    pending: ["kitchen.cereal-jar", "kitchen.sugar-jar", "kitchen.paper-towels"],
  },
  {
    id: "kitchen.standard-kitchenette",
    footprint: { w: 3.6, d: 0.8 },
    parts: [
      ...backWall(3.6, 0.8),
      at("utility.trash-bin-black", -1.6, againstBack(0.8, 0.35)),
      at("kitchen.sink-cabinet", -1.1, 0), at("kitchen.base-cabinet", -0.5, 0),
      at("kitchen.drawer-cabinet", 0.1, 0), at("kitchen.base-cabinet", 0.7, 0),
      at("kitchen.full-height-fridge", 1.4, againstBack(0.8, 0.69)),
      ...[-1.1, -0.5, 0.1, 0.7].map((x) => at("kitchen.upper-cabinet", x, againstBack(0.8, 0.35), 0, UPPER_CABINET)),
      at("kitchen.microwave", -0.5, -0.05, 0, COUNTER_TOP),
      at("greenery.plant-small", 0.75, -0.1, 0, COUNTER_TOP),
    ],
    pending: ["kitchen.coffee-brewer-drip"],
  },
  {
    id: "kitchen.water-and-snacks-station",
    footprint: { w: 2.4, d: 0.8 },
    parts: [
      ...backWall(2.4, 0.8),
      at("storage.open-shelf-tall", -0.35, againstBack(0.8, 0.35)),
      at("kitchen.glass-door-fridge-drinks", 0.45, againstBack(0.8, 0.69)),
      at("greenery.plant-small", -0.35, againstBack(0.8, 0.35), 0, 1.8),
      at("greenery.plant-small", 0.45, 0, 0, 1.8),
    ],
    pending: ["kitchen.water-dispenser", "kitchen.snack-jar"],
  },

  // ------------------------------------------------------------------ lounge sets (Lounge board)
  {
    id: "lounge.casual-meeting-set",
    footprint: { w: 2.5, d: 1.9 },
    parts: [
      at("lounge.round-casual-table", 0, 0.3),
      at("lounge.accent-chair-light", 0, -0.55), at("lounge.accent-chair-light", -0.85, 0.3, 90),
      at("lounge.accent-chair-light", 0.85, 0.3, 270),
      at("greenery.table-plant", 0, 0.3, 0, TABLE_TOP),
    ],
    pending: [],
  },
  {
    id: "lounge.high-table-set",
    footprint: { w: 2.2, d: 1.7 },
    parts: [
      at("meeting.standing-table", -0.2, 0),
      ...[-0.7, -0.2, 0.3].flatMap((x) => [at("seating.bar-stool-with-back", x, -0.6), at("seating.bar-stool-with-back", x, 0.6, 180)]),
      at("greenery.planter-box-low", 0.8, 0, 90),
    ],
    pending: [],
  },
  {
    id: "lounge.open-focus-nook",
    footprint: { w: 2.6, d: 1.6 },
    parts: [
      at("lounge.high-back-sofa", -0.85, 0, 90), at("lounge.high-back-sofa", 0.85, 0, 270),
      at("lounge.side-table", 0, 0), at("greenery.table-plant", 0, 0, 0, 0.52),
    ],
    pending: [],
  },
  {
    id: "lounge.open-lounge-set",
    footprint: { w: 2.3, d: 1.0 },
    parts: [
      at("lounge.lounge-chair-leather", -0.75, 0, 90), at("lounge.lounge-chair-leather", 0.75, 0, 270),
      at("lounge.round-coffee-table", 0, 0), at("greenery.table-plant", 0, 0, 0, 0.42),
    ],
    pending: [],
  },
  {
    id: "lounge.sofa-plus-chair-set",
    footprint: { w: 2.0, d: 2.7 },
    parts: [
      at("lounge.sofa-2-seater", 0, -0.8),
      at("lounge.rectangular-coffee-table", 0, 0.1),
      at("lounge.lounge-chair-fabric", -0.6, 0.95, 180), at("lounge.lounge-chair-fabric", 0.6, 0.95, 180),
    ],
    pending: ["decor.laptop-open"],
  },

  // ------------------------------------------------------------------ rooms (Meeting board)
  {
    id: "meeting.executive-office",
    footprint: { w: 3.6, d: 3.6 },
    parts: [
      ...room(3.6, 3.6, { back: SOLID, left: SOLID, right: GLASS, front: GLASS, door: GLASS_DOOR }),
      ...executiveDesk(0.3, -0.25),
      at("seating.visitor-chair", 0, 0.75, 180),
      at("lounge.accent-chair-dark", -1.25, 0.5, 90),
      at("greenery.large-plant", -1.25, -1.25), at("greenery.plant-medium", -1.35, 1.35),
    ],
    pending: [],
  },
  {
    id: "meeting.focus-room-personal",
    footprint: { w: 2.4, d: 2.4 },
    parts: [...glassRoom(2.4, 2.4), ...desk(0, -0.7, 1, { pedestal: 1 }), at("greenery.plant-medium", -0.8, 0.6)],
    pending: [KEYBOARD],
  },
  {
    id: "meeting.huddle-room",
    footprint: { w: 2.4, d: 2.4 },
    parts: [
      ...glassRoom(2.4, 2.4),
      at("meeting.round-table-4", 0, 0),
      ...around(CHAIR, 0, 0, { w: 1.0, d: 1.0 }, { along: [0], front: false, ends: true }),
      at("greenery.table-plant", 0, 0, 0, TABLE_TOP),
      at("greenery.plant-medium", -0.8, 0.8),
    ],
    pending: [],
  },
  {
    id: "meeting.large-conference-room",
    footprint: { w: 6.0, d: 4.8 },
    parts: [
      ...room(6.0, 4.8, { back: SOLID, left: GLASS, right: GLASS, front: GLASS, door: GLASS_DOOR }),
      at("meeting.conference-table-10", 0, 0.2),
      ...around("seating.conference-chair", 0, 0.2, { w: 3.2, d: 1.2 }, { along: [-1.2, -0.4, 0.4, 1.2], ends: true }),
      at("storage.credenza-low", 0, againstBack(4.8, 0.4)),
      at("tech.tv-display-75", 0, againstBack(4.8, 0.2), 0, SCREEN_MOUNT),
      at("tech.wall-whiteboard", -1.9, againstBack(4.8, 0.07), 0, SCREEN_MOUNT),
      at("greenery.large-plant", 2.45, -1.85), at("greenery.large-plant", -2.45, 1.85),
    ],
    pending: [],
  },
  {
    id: "meeting.medium-meeting-room",
    footprint: { w: 4.8, d: 3.6 },
    parts: [
      ...room(4.8, 3.6, { back: SOLID, left: GLASS, right: GLASS, front: GLASS, door: GLASS_DOOR }),
      at("meeting.rectangular-table-6", 0, 0.1),
      ...around(CHAIR, 0, 0.1, { w: 2.0, d: 1.0 }, { along: [-0.65, 0, 0.65] }),
      at("tech.tv-display-55", -0.9, againstBack(3.6, 0.2), 0, SCREEN_MOUNT),
      at("tech.wall-board", 0.6, againstBack(3.6, 0.07), 0, SCREEN_MOUNT),
      at("greenery.plant-medium", -1.95, 1.3), at("greenery.large-plant", 1.85, -1.25),
    ],
    pending: [],
  },
  {
    id: "meeting.small-meeting-room",
    footprint: { w: 3.6, d: 2.4 },
    parts: [
      ...room(3.6, 2.4, { back: SOLID, left: GLASS, right: GLASS, front: GLASS, door: GLASS_DOOR }),
      at("meeting.rectangular-table-6", 0, 0),
      ...around(CHAIR, 0, 0, { w: 2.0, d: 1.0 }, { along: [-0.45, 0.45] }),
      at("tech.tv-display-55", 0, againstBack(2.4, 0.2), 0, 1.0),
      at("greenery.plant-medium", 1.35, -0.75),
    ],
    pending: [],
  },

  // ------------------------------------------------------------------ display walls (Presentation board)
  {
    id: "tech.collaboration-wall",
    footprint: { w: 3.6, d: 1.2 },
    parts: [
      ...backWall(3.6, 1.2),
      at("tech.wall-whiteboard", -0.3, againstBack(1.2, 0.07), 0, SCREEN_MOUNT),
      at("tech.cork-board-1200x900", 0.9, againstBack(1.2, 0.03), 0, 0.95),
      at("greenery.large-plant", -1.35, againstBack(1.2, 0.9)), at("greenery.plant-medium", 1.5, againstBack(1.2, 0.6)),
    ],
    pending: [],
  },
  {
    id: "tech.mobile-display-stand",
    footprint: { w: 2.2, d: 0.8 },
    parts: [
      at("tech.screen-stand", -0.25, 0), at("tech.tv-display-65", -0.25, 0, 0, TV_ON_STAND),
      at("greenery.plant-medium", 0.8, 0),
    ],
    pending: [],
  },
  {
    id: "tech.presentation-corner",
    footprint: { w: 4.2, d: 1.2 },
    parts: [
      at("tech.screen-stand", -1.3, -0.2), at("tech.tv-display-65", -1.3, -0.2, 0, TV_ON_STAND),
      at("tech.mobile-whiteboard", 0.05, -0.25),
      at("lounge.round-high-table", 1.05, 0.2),
      at("greenery.plant-medium", 1.75, -0.3),
    ],
    pending: ["tech.laptop-open"],
  },
  {
    id: "tech.projector-and-screen-setup",
    footprint: { w: 3.6, d: 2.8 },
    parts: [
      ...backWall(3.6, 2.8),
      at("meeting.rectangular-table-6", -0.2, 0.3),
      ...around(CHAIR, -0.2, 0.3, { w: 2.0, d: 1.0 }, { along: [-0.65, 0, 0.65] }),
      at("greenery.plant-medium", 1.45, -0.95),
    ],
    pending: ["tech.projector-screen", "tech.ceiling-projector"],
  },
  {
    id: "tech.video-conferencing-setup",
    footprint: { w: 3.6, d: 3.0 },
    parts: [
      ...backWall(3.6, 3.0),
      at("tech.tv-display-75", 0, againstBack(3.0, 0.2), 0, 0.95),
      at("meeting.rectangular-table-6", 0, 0.4, 90),
      ...[-0.2, 0.4, 1.0].flatMap((z) => [at(CHAIR, -0.7, z, 90), at(CHAIR, 0.7, z, 270)]),
      at("greenery.plant-medium", 1.45, -1.0),
    ],
    pending: ["tech.conference-camera", "tech.speaker-bar", "tech.video-conference-speaker"],
  },
  {
    id: "tech.wall-mounted-display-setup",
    footprint: { w: 3.6, d: 0.8 },
    parts: [
      ...backWall(3.6, 0.8),
      at("storage.credenza-low", 0, againstBack(0.8, 0.4)),
      at("tech.tv-display-65", 0, againstBack(0.8, 0.2), 0, 1.0),
      at("greenery.plant-medium", 1.3, -0.05),
    ],
    pending: ["tech.speaker-bar"],
  },

  // ------------------------------------------------------------------ print stations (Print board)
  {
    id: "utility.compact-print-station",
    footprint: { w: 2.4, d: 0.7 },
    parts: [
      at("storage.storage-cabinet-low", 0, -0.1),
      at("utility.a4-desk-printer", -0.2, -0.1, 0, DESK_TOP), at("utility.scanner", 0.3, -0.1, 0, DESK_TOP),
      at("utility.confidential-shred-bin", -0.85, -0.1), at("greenery.plant-medium", 0.9, 0),
    ],
    pending: ["utility.paper-ream"],
  },
  {
    id: "utility.multi-printer-setup",
    footprint: { w: 3.8, d: 0.7 },
    parts: [
      at("storage.storage-cabinet-low", -0.6, -0.1), at("storage.storage-cabinet-low", 0.6, -0.1),
      at("utility.a4-desk-printer", -0.8, -0.1, 0, DESK_TOP), at("utility.a4-desk-printer", 0.1, -0.1, 0, DESK_TOP),
      at("utility.scanner", 0.75, -0.1, 0, DESK_TOP),
      at("utility.paper-shredder", -1.45, -0.1), at("greenery.tall-planter", 1.55, 0),
    ],
    pending: ["utility.paper-tray", "utility.paper-ream"],
  },
  {
    id: "utility.print-plus-supply-island",
    footprint: { w: 2.4, d: 1.2 },
    parts: [
      at("storage.credenza-low", 0, -0.2, 180), at("storage.credenza-low", 0, 0.2),
      at("utility.a4-desk-printer", -0.4, 0, 0, DESK_TOP), at("utility.scanner", 0.25, 0, 0, DESK_TOP),
      at("greenery.plant-small", 0.65, 0, 0, DESK_TOP),
      at("utility.recycling-blue", 1.0, 0),
    ],
    pending: ["storage.storage-box-small", "utility.paper-ream"],
  },
  {
    id: "utility.standard-print-station",
    footprint: { w: 2.4, d: 0.6 },
    parts: [
      ...backWall(2.4, 0.6),
      at("storage.credenza-low", 0, againstBack(0.6, 0.4)),
      at("utility.a4-desk-printer", -0.35, 0, 0, DESK_TOP), at("greenery.plant-small", 0.5, 0, 0, DESK_TOP),
      at("tech.cork-board-900x600", 0.4, againstBack(0.6, 0.03), 0, 1.2),
    ],
    pending: ["storage.storage-box-small"],
  },

  // ------------------------------------------------------------------ workstations (Workstation board)
  {
    id: "workstation.back-to-back-cluster",
    footprint: { w: 4.2, d: 2.5 },
    parts: [-1.4, 0, 1.4].flatMap((x, i) => [
      ...desk(x, 0.375, 1, { pedestal: 1, plant: i === 0 ? -1 : null }),
      ...desk(x, -0.375, -1, { pedestal: 1, plant: i === 2 ? 1 : null }),
      at("partition.low-partition-fabric", x, 0),
    ]),
    pending: [KEYBOARD],
  },
  {
    id: "workstation.benching-2-seater",
    footprint: { w: 1.6, d: 2.4 },
    parts: [
      ...desk(0, 0.35, 1, { pedestal: 1, plant: -1 }),
      ...desk(0, -0.35, -1, { pedestal: 1 }),
      at("partition.front-screen-fabric", 0, 0, 0, DESK_TOP),
    ],
    pending: [KEYBOARD],
  },
  {
    id: "workstation.benching-4-seater",
    footprint: { w: 2.8, d: 2.4 },
    parts: [
      at("workstation.bench-desk-4", 0, 0),
      ...[-0.7, 0.7].flatMap((x) => [
        ...place(x, 0.35, 1, { pedestal: Math.sign(x) }),
        ...place(x, -0.35, -1, { pedestal: Math.sign(x) }),
        at("partition.front-screen-fabric", x, 0, 0, DESK_TOP),
      ]),
      at("greenery.desk-plant-small", -0.2, 0.15, 0, DESK_TOP),
    ],
    pending: [KEYBOARD],
  },
  {
    id: "workstation.executive-desk",
    footprint: { w: 2.0, d: 2.7 },
    parts: [...executiveDesk(0, 0), at("seating.visitor-chair", -0.1, 1.05, 180)],
    pending: [KEYBOARD],
  },
  {
    id: "workstation.hot-desk-flex",
    footprint: { w: 2.8, d: 2.4 },
    parts: [
      at("workstation.bench-desk-4", 0, 0),
      ...[-0.7, 0.7].flatMap((x) => [
        ...place(x, 0.35, 1, { chair: "seating.task-chair-grey", monitor: null }),
        ...place(x, -0.35, -1, { chair: "seating.task-chair-grey", monitor: null }),
      ]),
      at("greenery.desk-plant-small", 0, 0, 0, DESK_TOP),
    ],
    pending: ["tech.laptop-open", "tech.desk-power-module"],
  },
  {
    id: "workstation.single-workstation",
    footprint: { w: 1.6, d: 1.4 },
    parts: desk(0, -0.35, 1, { pedestal: 1, plant: -1 }),
    pending: [KEYBOARD],
  },
];

export const LAYOUTS: readonly Layout[] = entries;
