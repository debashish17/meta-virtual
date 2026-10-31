# Blender asset pipeline

Turns the 11 reference boards in `../reference/` into:

1. a **catalogue**: every printed label read by OCR and matched to the object above it, with name,
   category, kind (part, composite or reference) and printed size;
2. a **kit** of GLB parts, built in Blender by parametric builders sized from those labels, each
   measured and checked by QA and reviewed by a person;
3. **layouts**: the boards' composites (rooms, sets, stations) as placements of built parts.

The office scene still uses the 34 v1 GLBs. Moving it to the kit is a separate step.

## Run

Run from the repository root:

```bash
python blender-asset-pipeline/run.py catalog   # OCR -> labels -> crops -> catalogue + catalogue page
python blender-asset-pipeline/run.py build     # catalogue parts -> Blender GLBs + renders -> QA + review sheet
python blender-asset-pipeline/run.py qa        # re-score existing builds and apply data/reviews.json
python blender-asset-pipeline/run.py all       # catalog, then build
python blender-asset-pipeline/run.py test      # Python unit tests
```

Requirements:

- **Windows.** OCR uses the built-in `Windows.Media.Ocr` through `catalog/winocr.ps1`. Results are
  cached in `generated/catalog/ocr/`.
- **Blender 5.2** at its default install path, or wherever `BLENDER_EXE` points.
- **Python 3.11+** with `numpy`, `opencv-python`, `pillow` and `trimesh`.

`catalog` exits non-zero if any correction in `data/corrections.toml` matched nothing. That
usually means a typo, or OCR now reads the text differently.

`build` only rebuilds parts whose spec or kit code changed.

## What you edit (`data/`)

| File | Holds |
| --- | --- |
| `boards.toml` | which boards are catalogues and which are style sheets, plus per-board settings |
| `corrections.toml` | fixes for what OCR got wrong (see below) |
| `families.toml` | label → builder family rules, with params, category and section fallbacks |
| `sprites.toml` | reference sprites whose enclosed gaps are real background (e.g. inside a headband), kept transparent |
| `reviews.json` | approve/reject decisions exported from the review sheet |

`corrections.toml` has these sections:

- `[names]` (global or per board): label text fixes.
- `[dims]` and `[item_dims]`: size text fixes.
- `[[split]]`: cells OCR merged.
- `[[drop]]`: text that is not a label.
- `[[ignore]]`: artwork regions that are not items.
- `[[text]]`: printed text OCR missed, such as a section header.
- `[[add]]`: objects with no label.

Every item records whether its name and size came from the board or from a hand correction.

`generated/` (OCR cache, build ledger, batches, report) can be deleted at any time; the next run
recreates it (OCR then takes a few minutes per board).

## Outputs

| Output | Path |
| --- | --- |
| Catalogue (Zod: `packages/shared/src/catalogue/schema.ts`) | `packages/shared/src/catalogue/catalogue.generated.json` |
| Builds, QA and review status (Zod: `builds.ts`) | `packages/shared/src/catalogue/builds.generated.json` |
| GLBs | `apps/web/public/assets/models/catalogue/<id>.glb` |
| Thumbnails at a fixed 160 px/m | `apps/web/public/assets/catalogue/thumbs/` |
| Board crops | `apps/web/public/assets/catalogue/crops/` |
| Catalogue page | `/assets/catalogue/index.html` |
| Build review sheet | `/assets/catalogue/review.html` |
| Reference sprites (cut against the board colour: board shadows and pale rims removed, pale parts inside the outline kept, holes closed, trimmed) + manifest | `apps/web/public/assets/sprites/`, `packages/shared/src/world/sprites.generated.json` |
| Measured part sizes, for world obstacles | `packages/shared/src/world/footprints.generated.json` |
| Detail textures (generated each build, tinted per material in Blender) | `blender-asset-pipeline/generated/textures/` |

## QA and review

QA measures each GLB with trimesh, independently of Blender. Each check passes or fails on its own:

- printed size;
- builder target;
- triangle budget;
- file size;
- floor-centred origin;
- materials.

A part with no printed size is `unchecked`, never `pass`.

To review: open the review sheet with the web dev server running, approve or reject each card,
export to `data/reviews.json`, then run `run.py qa`.

Textured materials (fabric weave, acoustic felt, oak grain, leather, concrete, cork, rug pile)
use seamless detail maps from `catalog/textures.py`, tinted with the palette colour inside
Blender and embedded in each GLB as JPEG, on box-projected UVs at real-world scale.

A decision goes **stale** when either of these changes:

- the part's spec (family, params, size);
- its geometry hash: the GLB's triangles per material (name, colour and texture pixels), ignoring vertex order.

Stale cards need a fresh look.

## Layouts and the catalogue gallery

Layouts live in `packages/shared/src/layouts/` (Zod schema, helpers, `data.ts`). Tests check:

- every composite has exactly one layout;
- layouts place only built parts;
- `pending` lists only reference items;
- every part fits its footprint and stays under the 3 m ceiling.

Things a board picture shows that no builder makes yet go in `pending` and are never substituted.

To review builds, run `pnpm dev` and open `http://localhost:5173/assets/catalogue/review.html`
(the review sheet; the 3D catalogue gallery was retired with the old app modes).

## Layout of this folder

| Path | Role |
| --- | --- |
| `run.py` | entry point |
| `catalog/` | OCR, label parsing, segmentation, association, catalogue, build driver, QA, review pages |
| `blender_kit/` | runs inside Blender: materials, primitives, export, fixed-scale render, `families/` builders |
| `tests/` | unit tests for everything outside Blender |
| `scripts/asset_builders.py`, `run_pipeline.py`, `update_manifest_ts.py` | **v1**, still generate the office's 34 GLBs and `assetManifest.ts` |
| `_archive/` | the v2 pipeline, v1 scripts that patched app source in place, and pre-change originals (see its README) |
| `AGENT_TASK.md`, `PIPELINE.md`, `ASSET_INVENTORY.md`, `QA_CHECKLIST.md`, `templates/` | the earlier handoff plan; superseded by this README where they disagree |

## Hard rules

- Never modify, rename or delete anything in `../reference/`.
- Builds must be scripted and rerunnable (Blender Python), never one-off manual edits.
- Do not replace the main office scene until the catalogue gallery passes review.
