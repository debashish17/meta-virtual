// Auto-generated from pipeline — DO NOT hand-edit; rerun the pipeline to update.
// Schema: blender-asset-pipeline/templates/manifest.schema.json

export interface AssetDimensions {
  w: number;
  d: number;
  h: number;
}

export interface AssetFootprint {
  w: number;
  d: number;
}

export type CollisionType = 'solid' | 'decor' | 'none';
export type AssetStatus = 'auto-approved' | 'approved' | 'rejected' | 'sprite-only' | 'modelled';
export type AssetCategory =
  | 'architecture'
  | 'workstation'
  | 'seating'
  | 'meeting'
  | 'kitchen'
  | 'storage'
  | 'greenery'
  | 'tech'
  | 'partition'
  | 'utility'
  | 'lounge';

export interface AssetEntry {
  id: string;
  name: string;
  category: AssetCategory;
  model: string | null;
  sprite?: string | null;
  thumbnail?: string | null;
  dimensionsM: AssetDimensions;
  footprint: AssetFootprint;
  anchor: [number, number];
  collision: CollisionType;
  palette?: string[];
  sourceBoard: string;
  status: AssetStatus;
  triCount?: number | null;
}

const assetManifest: AssetEntry[] = [
  {
    "id": "workstation.desk-2p",
    "name": "Two-Person Workstation",
    "category": "workstation",
    "model": "/assets/models/workstation.desk-2p.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/workstation.desk-2p.png",
    "dimensionsM": {
      "w": 2.4,
      "d": 0.9,
      "h": 0.74
    },
    "footprint": {
      "w": 2.4,
      "d": 0.9
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "oak",
      "black_metal",
      "charcoal",
      "felt_grey",
      "screen_blue"
    ],
    "sourceBoard": "Isometric Modern Office Kit.png",
    "status": "modelled",
    "triCount": 6240
  },
  {
    "id": "workstation.desk-2p-b",
    "name": "Two-Person Workstation (Dual Pedestals)",
    "category": "workstation",
    "model": "/assets/models/workstation.desk-2p-b.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/workstation.desk-2p-b.png",
    "dimensionsM": {
      "w": 2.4,
      "d": 0.9,
      "h": 0.74
    },
    "footprint": {
      "w": 2.4,
      "d": 0.9
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "oak",
      "black_metal",
      "charcoal",
      "felt_grey",
      "chrome"
    ],
    "sourceBoard": "Isometric Modern Office Kit.png",
    "status": "modelled",
    "triCount": 7140
  },
  {
    "id": "seating.office-chair",
    "name": "Ergonomic Office Chair (5-Star Base)",
    "category": "seating",
    "model": "/assets/models/seating.office-chair.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/seating.office-chair.png",
    "dimensionsM": {
      "w": 0.65,
      "d": 0.65,
      "h": 1.05
    },
    "footprint": {
      "w": 0.65,
      "d": 0.65
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "grey_fabric",
      "black_metal",
      "charcoal",
      "chrome"
    ],
    "sourceBoard": "Isometric Modern Office Kit.png",
    "status": "modelled",
    "triCount": 3700
  },
  {
    "id": "tech.monitor-set",
    "name": "Dual Monitor & Keyboard Set",
    "category": "tech",
    "model": "/assets/models/tech.monitor-set.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/tech.monitor-set.png",
    "dimensionsM": {
      "w": 1.1,
      "d": 0.25,
      "h": 0.45
    },
    "footprint": {
      "w": 1.1,
      "d": 0.25
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "decor",
    "palette": [
      "screen_blue",
      "charcoal",
      "black_metal",
      "chrome"
    ],
    "sourceBoard": "Isometric Modern Office Kit.png",
    "status": "modelled",
    "triCount": 764
  },
  {
    "id": "greenery.desk-plant",
    "name": "Desk Plant (Succulent)",
    "category": "greenery",
    "model": "/assets/models/greenery.desk-plant.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/greenery.desk-plant.png",
    "dimensionsM": {
      "w": 0.22,
      "d": 0.22,
      "h": 0.35
    },
    "footprint": {
      "w": 0.22,
      "d": 0.22
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "decor",
    "palette": [
      "ceramic",
      "leaf_a",
      "leaf_b",
      "charcoal"
    ],
    "sourceBoard": "Isometric Modern Office Kit.png",
    "status": "modelled",
    "triCount": 2156
  },
  {
    "id": "architecture.glass-panel",
    "name": "Glass Partition Panel",
    "category": "architecture",
    "model": "/assets/models/architecture.glass-panel.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/architecture.glass-panel.png",
    "dimensionsM": {
      "w": 1.6,
      "d": 0.08,
      "h": 2.6
    },
    "footprint": {
      "w": 1.6,
      "d": 0.08
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "glass_pale",
      "charcoal",
      "black_metal",
      "white_lam"
    ],
    "sourceBoard": "Isometric Modern Office Kit.png",
    "status": "modelled",
    "triCount": 648
  },
  {
    "id": "greenery.plant-large",
    "name": "Large Floor Plant (Monstera)",
    "category": "greenery",
    "model": "/assets/models/greenery.plant-large.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/greenery.plant-large.png",
    "dimensionsM": {
      "w": 0.6,
      "d": 0.6,
      "h": 1.1
    },
    "footprint": {
      "w": 0.6,
      "d": 0.6
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "ceramic",
      "leaf_a",
      "leaf_b",
      "charcoal"
    ],
    "sourceBoard": "Isometric Modern Office Kit.png",
    "status": "modelled",
    "triCount": 1620
  },
  {
    "id": "meeting.table-6p",
    "name": "6-Person Meeting Table",
    "category": "meeting",
    "model": "/assets/models/meeting.table-6p.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/meeting.table-6p.png",
    "dimensionsM": {
      "w": 2.4,
      "d": 1.1,
      "h": 0.74
    },
    "footprint": {
      "w": 2.4,
      "d": 1.1
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "oak",
      "black_metal",
      "chrome",
      "charcoal"
    ],
    "sourceBoard": "Meeting Rooms & Private Spaces Catalog.png",
    "status": "modelled",
    "triCount": 1468
  },
  {
    "id": "seating.meeting-chair",
    "name": "Cantilever Meeting Chair",
    "category": "seating",
    "model": "/assets/models/seating.meeting-chair.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/seating.meeting-chair.png",
    "dimensionsM": {
      "w": 0.6,
      "d": 0.6,
      "h": 0.95
    },
    "footprint": {
      "w": 0.6,
      "d": 0.6
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "grey_fabric",
      "chrome",
      "charcoal"
    ],
    "sourceBoard": "Meeting Rooms & Private Spaces Catalog.png",
    "status": "modelled",
    "triCount": 1316
  },
  {
    "id": "architecture.glass-door",
    "name": "Glass Door Unit",
    "category": "architecture",
    "model": "/assets/models/architecture.glass-door.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/architecture.glass-door.png",
    "dimensionsM": {
      "w": 1.0,
      "d": 0.08,
      "h": 2.6
    },
    "footprint": {
      "w": 1.0,
      "d": 0.08
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "glass_pale",
      "charcoal",
      "black_metal",
      "chrome"
    ],
    "sourceBoard": "Meeting Rooms & Private Spaces Catalog.png",
    "status": "modelled",
    "triCount": 584
  },
  {
    "id": "tech.wall-screen",
    "name": "Wall Screen / TV Display",
    "category": "tech",
    "model": "/assets/models/tech.wall-screen.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/tech.wall-screen.png",
    "dimensionsM": {
      "w": 1.5,
      "d": 0.08,
      "h": 0.85
    },
    "footprint": {
      "w": 1.5,
      "d": 0.08
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "decor",
    "palette": [
      "screen_blue",
      "charcoal",
      "black_metal",
      "chrome"
    ],
    "sourceBoard": "Presentation & Tech Asset Catalog.png",
    "status": "modelled",
    "triCount": 336
  },
  {
    "id": "tech.whiteboard",
    "name": "Mobile Whiteboard on Casters",
    "category": "tech",
    "model": "/assets/models/tech.whiteboard.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/tech.whiteboard.png",
    "dimensionsM": {
      "w": 1.6,
      "d": 0.06,
      "h": 1.1
    },
    "footprint": {
      "w": 1.6,
      "d": 0.06
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "decor",
    "palette": [
      "white_lam",
      "chrome",
      "charcoal",
      "book_ochre"
    ],
    "sourceBoard": "Presentation & Tech Asset Catalog.png",
    "status": "modelled",
    "triCount": 1188
  },
  {
    "id": "kitchen.run",
    "name": "Office Kitchenette Run",
    "category": "kitchen",
    "model": "/assets/models/kitchen.run.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/kitchen.run.png",
    "dimensionsM": {
      "w": 2.6,
      "d": 0.7,
      "h": 2.2
    },
    "footprint": {
      "w": 2.6,
      "d": 0.7
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "oak",
      "white_lam",
      "stainless",
      "chrome",
      "charcoal"
    ],
    "sourceBoard": "Modern Office Kitchenette Asset Board.png",
    "status": "modelled",
    "triCount": 2100
  },
  {
    "id": "storage.shelf-unit",
    "name": "Tiered Storage Shelf Unit",
    "category": "storage",
    "model": "/assets/models/storage.shelf-unit.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/storage.shelf-unit.png",
    "dimensionsM": {
      "w": 1.0,
      "d": 0.4,
      "h": 1.8
    },
    "footprint": {
      "w": 1.0,
      "d": 0.4
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "black_metal",
      "oak",
      "ceramic",
      "felt_grey",
      "book_navy",
      "book_wine"
    ],
    "sourceBoard": "Office Storage & Organization Asset Sheet.png",
    "status": "modelled",
    "triCount": 5072
  },
  {
    "id": "utility.printer-cabinet",
    "name": "Office Printer on Cabinet",
    "category": "utility",
    "model": "/assets/models/utility.printer-cabinet.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/utility.printer-cabinet.png",
    "dimensionsM": {
      "w": 0.9,
      "d": 0.6,
      "h": 1.1
    },
    "footprint": {
      "w": 0.9,
      "d": 0.6
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "oak",
      "charcoal",
      "white_lam",
      "chrome",
      "screen_blue"
    ],
    "sourceBoard": "Print & Utility Office Asset Library.png",
    "status": "modelled",
    "triCount": 1176
  },
  {
    "id": "seating.lounge-chair",
    "name": "Modern Scandinavian Armchair",
    "category": "seating",
    "model": "/assets/models/seating.lounge-chair.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/seating.lounge-chair.png",
    "dimensionsM": {
      "w": 0.75,
      "d": 0.8,
      "h": 0.95
    },
    "footprint": {
      "w": 0.75,
      "d": 0.8
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "oak",
      "charcoal",
      "black_metal"
    ],
    "sourceBoard": "Office Lounge Seating Reference Board.png",
    "status": "modelled",
    "triCount": 1984
  },
  {
    "id": "seating.sofa-2p",
    "name": "2-Seater Lounge Sofa",
    "category": "seating",
    "model": "/assets/models/seating.sofa-2p.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/seating.sofa-2p.png",
    "dimensionsM": {
      "w": 1.8,
      "d": 0.85,
      "h": 0.9
    },
    "footprint": {
      "w": 1.8,
      "d": 0.85
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "oak",
      "felt_grey",
      "charcoal"
    ],
    "sourceBoard": "Office Lounge Seating Reference Board.png",
    "status": "modelled",
    "triCount": 2448
  },
  {
    "id": "architecture.wall-straight",
    "name": "Straight Wall Section",
    "category": "architecture",
    "model": "/assets/models/architecture.wall-straight.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/architecture.wall-straight.png",
    "dimensionsM": {
      "w": 2.0,
      "d": 0.15,
      "h": 2.6
    },
    "footprint": {
      "w": 2.0,
      "d": 0.15
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "white_lam",
      "charcoal"
    ],
    "sourceBoard": "Isometric Modern Office Kit.png",
    "status": "modelled",
    "triCount": 324
  },
  {
    "id": "architecture.wall-corner",
    "name": "Corner Wall Section",
    "category": "architecture",
    "model": "/assets/models/architecture.wall-corner.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/architecture.wall-corner.png",
    "dimensionsM": {
      "w": 2.0,
      "d": 2.0,
      "h": 2.6
    },
    "footprint": {
      "w": 2.0,
      "d": 2.0
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "white_lam",
      "charcoal"
    ],
    "sourceBoard": "Isometric Modern Office Kit.png",
    "status": "modelled",
    "triCount": 432
  },
  {
    "id": "architecture.window-city",
    "name": "City-View Window Wall",
    "category": "architecture",
    "model": "/assets/models/architecture.window-city.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/architecture.window-city.png",
    "dimensionsM": {
      "w": 3.2,
      "d": 0.15,
      "h": 2.6
    },
    "footprint": {
      "w": 3.2,
      "d": 0.15
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "black_metal",
      "glass_pale",
      "oak"
    ],
    "sourceBoard": "Doors, Entries & Window Views Asset Sheet.png",
    "status": "modelled",
    "triCount": 864
  },
  {
    "id": "architecture.floor-slab",
    "name": "Concrete Modular Floor Slab",
    "category": "architecture",
    "model": "/assets/models/architecture.floor-slab.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/architecture.floor-slab.png",
    "dimensionsM": {
      "w": 3.0,
      "d": 3.0,
      "h": 0.08
    },
    "footprint": {
      "w": 3.0,
      "d": 3.0
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "none",
    "palette": [
      "floor_grey",
      "charcoal"
    ],
    "sourceBoard": "Isometric Modern Office Kit.png",
    "status": "modelled",
    "triCount": 132
  },
  {
    "id": "partition.desk-divider",
    "name": "Acoustic Desk Divider Screen",
    "category": "partition",
    "model": "/assets/models/partition.desk-divider.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/partition.desk-divider.png",
    "dimensionsM": {
      "w": 1.2,
      "d": 0.05,
      "h": 0.45
    },
    "footprint": {
      "w": 1.2,
      "d": 0.05
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "decor",
    "palette": [
      "felt_grey",
      "black_metal",
      "chrome"
    ],
    "sourceBoard": "Partitions & Dividers Asset Catalog.png",
    "status": "modelled",
    "triCount": 460
  },
  {
    "id": "greenery.plant-floor-a",
    "name": "Snake Plant (Sansevieria) on Stand",
    "category": "greenery",
    "model": "/assets/models/greenery.plant-floor-a.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/greenery.plant-floor-a.png",
    "dimensionsM": {
      "w": 0.45,
      "d": 0.45,
      "h": 0.8
    },
    "footprint": {
      "w": 0.45,
      "d": 0.45
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "ceramic",
      "oak",
      "leaf_var",
      "charcoal"
    ],
    "sourceBoard": "Isometric Modern Office Kit.png",
    "status": "modelled",
    "triCount": 1648
  },
  {
    "id": "architecture.glass-panel-narrow",
    "name": "Narrow Glass Partition Panel",
    "category": "architecture",
    "model": "/assets/models/architecture.glass-panel-narrow.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/architecture.glass-panel-narrow.png",
    "dimensionsM": {
      "w": 0.8,
      "d": 0.08,
      "h": 2.6
    },
    "footprint": {
      "w": 0.8,
      "d": 0.08
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "glass_pale",
      "charcoal",
      "black_metal",
      "white_lam"
    ],
    "sourceBoard": "Partitions & Dividers Asset Catalog.png",
    "status": "modelled",
    "triCount": 648
  },
  {
    "id": "architecture.ceiling-track",
    "name": "Ceiling Track Light Fixture",
    "category": "architecture",
    "model": "/assets/models/architecture.ceiling-track.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/architecture.ceiling-track.png",
    "dimensionsM": {
      "w": 2.0,
      "d": 0.15,
      "h": 0.35
    },
    "footprint": {
      "w": 2.0,
      "d": 0.15
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "decor",
    "palette": [
      "black_metal",
      "chrome",
      "screen_blue"
    ],
    "sourceBoard": "Isometric Modern Office Kit.png",
    "status": "modelled",
    "triCount": 712
  },
  {
    "id": "workstation.desk-single",
    "name": "Single Workstation Desk",
    "category": "workstation",
    "model": "/assets/models/workstation.desk-single.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/workstation.desk-single.png",
    "dimensionsM": {
      "w": 1.4,
      "d": 0.7,
      "h": 0.75
    },
    "footprint": {
      "w": 1.4,
      "d": 0.7
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "oak",
      "black_metal",
      "felt_grey",
      "screen_blue"
    ],
    "sourceBoard": "Isometric Workstation Variations Guide.png",
    "status": "modelled",
    "triCount": 2324
  },
  {
    "id": "workstation.desk-4p",
    "name": "4-Person Benching Workstation",
    "category": "workstation",
    "model": "/assets/models/workstation.desk-4p.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/workstation.desk-4p.png",
    "dimensionsM": {
      "w": 2.8,
      "d": 1.4,
      "h": 0.75
    },
    "footprint": {
      "w": 2.8,
      "d": 1.4
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "oak",
      "black_metal",
      "felt_grey",
      "screen_blue"
    ],
    "sourceBoard": "Isometric Workstation Variations Guide.png",
    "status": "modelled",
    "triCount": 5148
  },
  {
    "id": "workstation.desk-l-shape",
    "name": "Executive L-Shaped Desk with Return",
    "category": "workstation",
    "model": "/assets/models/workstation.desk-l-shape.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/workstation.desk-l-shape.png",
    "dimensionsM": {
      "w": 1.6,
      "d": 1.4,
      "h": 0.75
    },
    "footprint": {
      "w": 1.6,
      "d": 1.4
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "oak",
      "black_metal",
      "charcoal",
      "white_lam"
    ],
    "sourceBoard": "Isometric Workstation Variations Guide.png",
    "status": "modelled",
    "triCount": 2452
  },
  {
    "id": "workstation.desk-standing",
    "name": "Motorized Standing Desk",
    "category": "workstation",
    "model": "/assets/models/workstation.desk-standing.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/workstation.desk-standing.png",
    "dimensionsM": {
      "w": 1.4,
      "d": 0.7,
      "h": 1.1
    },
    "footprint": {
      "w": 1.4,
      "d": 0.7
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "oak",
      "black_metal",
      "charcoal",
      "screen_blue"
    ],
    "sourceBoard": "Isometric Workstation Variations Guide.png",
    "status": "modelled",
    "triCount": 2084
  },
  {
    "id": "seating.stool-high",
    "name": "High Timber Bar Stool",
    "category": "seating",
    "model": "/assets/models/seating.stool-high.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/seating.stool-high.png",
    "dimensionsM": {
      "w": 0.45,
      "d": 0.45,
      "h": 0.75
    },
    "footprint": {
      "w": 0.45,
      "d": 0.45
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "oak",
      "black_metal"
    ],
    "sourceBoard": "Modern Office Kitchenette Asset Board.png",
    "status": "modelled",
    "triCount": 688
  },
  {
    "id": "storage.pedestal-drawer",
    "name": "Mobile Pedestal File Drawer",
    "category": "storage",
    "model": "/assets/models/storage.pedestal-drawer.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/storage.pedestal-drawer.png",
    "dimensionsM": {
      "w": 0.4,
      "d": 0.5,
      "h": 0.6
    },
    "footprint": {
      "w": 0.4,
      "d": 0.5
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "white_lam",
      "black_metal",
      "charcoal",
      "chrome"
    ],
    "sourceBoard": "Office Storage & Organization Asset Sheet.png",
    "status": "modelled",
    "triCount": 968
  },
  {
    "id": "architecture.phone-booth",
    "name": "Acoustic Privacy Phone Booth",
    "category": "architecture",
    "model": "/assets/models/architecture.phone-booth.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/architecture.phone-booth.png",
    "dimensionsM": {
      "w": 1.0,
      "d": 1.0,
      "h": 2.4
    },
    "footprint": {
      "w": 1.0,
      "d": 1.0
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "oak",
      "glass_pale",
      "felt_grey",
      "black_metal"
    ],
    "sourceBoard": "Meeting Rooms & Private Spaces Catalog.png",
    "status": "modelled",
    "triCount": 1532
  },
  {
    "id": "lounge.coffee-table",
    "name": "Round Timber Coffee Table",
    "category": "lounge",
    "model": "/assets/models/lounge.coffee-table.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/lounge.coffee-table.png",
    "dimensionsM": {
      "w": 0.8,
      "d": 0.8,
      "h": 0.45
    },
    "footprint": {
      "w": 0.8,
      "d": 0.8
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "solid",
    "palette": [
      "oak",
      "black_metal",
      "ceramic"
    ],
    "sourceBoard": "Office Lounge Seating Reference Board.png",
    "status": "modelled",
    "triCount": 644
  },
  {
    "id": "lounge.rug",
    "name": "Neutral Woven Area Rug",
    "category": "lounge",
    "model": "/assets/models/lounge.rug.glb",
    "sprite": null,
    "thumbnail": "/blender-asset-pipeline/generated/thumbs/lounge.rug.png",
    "dimensionsM": {
      "w": 2.0,
      "d": 1.5,
      "h": 0.01
    },
    "footprint": {
      "w": 2.0,
      "d": 1.5
    },
    "anchor": [
      0.5,
      0.5
    ],
    "collision": "none",
    "palette": [
      "felt_grey",
      "floor_grey"
    ],
    "sourceBoard": "Office Lounge Seating Reference Board.png",
    "status": "modelled",
    "triCount": 188
  }
];

import { referenceAssets, REFERENCE_BOARDS } from './referenceAssetsManifest'

export const canonicalAssets = assetManifest
export { referenceAssets, REFERENCE_BOARDS }
export const allAssets = [...canonicalAssets, ...referenceAssets]

export default assetManifest
