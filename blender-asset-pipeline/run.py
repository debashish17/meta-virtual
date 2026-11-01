"""Asset pipeline entry point.

    python blender-asset-pipeline/run.py catalog   # OCR -> labels -> crops -> catalogue + review page
    python blender-asset-pipeline/run.py build     # catalogue parts -> Blender GLBs + renders -> QA + review sheet
    python blender-asset-pipeline/run.py qa        # re-run QA / review sheet on existing builds (after reviews.json)
    python blender-asset-pipeline/run.py all       # catalog, then build
    python blender-asset-pipeline/run.py test      # unit tests

Hand-edited inputs live in data/ (*.toml, reviews.json); everything else is regenerated.
"""

from __future__ import annotations

import argparse
import json
import shutil
import statistics
import sys
import tomllib
import unittest
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from catalog import build, paths  # noqa: E402
from catalog.associate import Match, associate  # noqa: E402
from catalog.boxes import Box  # noqa: E402
from catalog.catalogue import Corrections, FamilyRules, build_catalogue, slugify  # noqa: E402
from catalog.labels import (Cell, LabelBlock, build_blocks, parse_dims, section_above, split_cell,  # noqa: E402
                            split_line)
from catalog.ocr import read_board  # noqa: E402
from catalog.qa import evaluate, geometry_hash, measure_glb, review_status  # noqa: E402
from catalog.report import write_review_page  # noqa: E402
from catalog.review import write_build_review  # noqa: E402
from catalog.segment import crop, load, segment, split_art_text  # noqa: E402
from catalog.sprites import write_sprites  # noqa: E402
from catalog.textures import write_textures  # noqa: E402
from catalog.specs import build_specs  # noqa: E402


def load_toml(name: str) -> dict:
    return tomllib.loads((paths.DATA / name).read_text(encoding="utf-8"))


def board_settings(boards_cfg: dict, file: str) -> dict:
    return {**boards_cfg.get("defaults", {}), **boards_cfg.get("board", {}).get(file, {})}


def hand_added(board: Path, corrections: Corrections, sections, seg) -> list[tuple[LabelBlock, Match]]:
    """Objects with no printed label, named in corrections.toml [[add]] by their board box."""
    out = []
    for add in corrections.adds:
        if add["board"] != board.name:
            continue
        box = Box(*add["box"])
        sec = section_above(box, sections)
        block = LabelBlock(add["name"], add["name"], box, box, None, "above", None, sec.text if sec else None)
        parts = tuple(b for b in seg.boxes if box.x0 <= b.cx <= box.x1 and box.y0 <= (b.y0 + b.y1) / 2 <= box.y1)
        out.append((block, Match(box, parts or (box,))))
    return out


def prepare_cells(board: Path, lines, band: int, corrections: Corrections,
                  issues: list[str]) -> tuple[list[Cell], list[Box]]:
    """OCR lines -> cells below the header band, with [[split]], [[drop]] and [dims] fixes applied.
    Also returns the boxes of cells whose text a [dims] correction replaced (for provenance)."""
    cells, corrected = [], []
    for cell in (c for line in lines for c in split_line(line)):
        if cell.box.y0 < band:
            continue
        counts = corrections.split(board.name, cell.text)
        parts = split_cell(cell, counts) if counts else [cell]
        if parts is None:
            issues.append(f"[[split]] for {cell.text!r} does not match its {len(cell.words)} words")
            parts = [cell]
        for p in parts:
            if corrections.dropped(board.name, p.text):
                continue
            text = corrections.dims(p.text)
            if text != p.text:
                corrected.append(p.box)
            cells.append(Cell(text, p.box, p.words))
    return cells, corrected


def catalogue_board(board: Path, settings: dict, corrections: Corrections) -> tuple[list[dict], dict]:
    lines = read_board(board) + corrections.missed_text(board.name)
    rgb, distance = load(board)
    height, width = distance.shape
    band = int(settings["header_band"] * height)
    issues: list[str] = []

    cells, corrected_cells = prepare_cells(board, lines, band, corrections, issues)
    cells, art = split_art_text(cells, distance)
    sections, blocks = build_blocks(cells, issues)
    blocks = [b for b in blocks if not corrections.dropped(board.name, corrections.name(b.name, board.name))]

    # mask only text-sized words: OCR sometimes returns one huge "word" over artwork
    words = [w for line in lines for w in line]
    word_h = statistics.median(w.box.h for w in words) if words else 10.0
    seg = segment(rgb, distance, [w.box for w in words if w.box.h <= 2.5 * word_h], band)
    # [[ignore]] regions hold artwork that is not an item (e.g. 2D top-view diagrams)
    ignored = [Box(*i["box"]) for i in corrections.ignores if i["board"] == board.name]
    objects = [b for b in seg.boxes if not any(r.x0 <= b.cx <= r.x1 and r.y0 <= (b.y0 + b.y1) / 2 <= r.y1
                                               for r in ignored)]
    assoc = associate(blocks, sections, objects, (width, height))
    added = hand_added(board, corrections, sections, seg)

    board_slug = slugify(board.stem)
    crop_names: Counter = Counter()
    occurrences = []
    labelled = [(b, assoc.items.get(b), "board") for b in blocks] + [(b, m, "hand") for b, m in added]
    for block, match, origin in labelled:
        name = corrections.name(block.name, board.name)
        fixed = corrections.item_dims(name)
        dims_text = fixed or corrections.dims(block.dims_text)
        dims = parse_dims(dims_text) if dims_text else None
        corrected = bool(fixed) or dims_text != block.dims_text or any(
            block.dims_box is not None and block.dims_box.contains(c) for c in corrected_cells)
        dims_origin = ("correction" if corrected else "label") if dims else None
        if dims_text and dims is None:
            issues.append(f"unparsed dims for {name!r}: {dims_text!r} (add to corrections.toml [item_dims])")
        crop_url = None
        if match:
            stem = slugify(name)
            crop_names[stem] += 1
            file = f"{stem}-{crop_names[stem]}.png" if crop_names[stem] > 1 else f"{stem}.png"
            out = paths.CROPS / board_slug / file
            out.parent.mkdir(parents=True, exist_ok=True)
            crop(seg, match.parts).save(out)
            crop_url = f"{paths.CROPS_URL}/{board_slug}/{file}"
        occurrences.append({
            "name": name, "raw_name": block.raw_name, "board": board.name, "section": block.section,
            "dims": dims, "dims_text": dims_text, "dims_origin": dims_origin, "placement": block.placement,
            "subtitle": block.subtitle, "label_box": block.box.as_list(),
            "item_box": match.box.as_list() if match else None, "crop": crop_url, "origin": origin,
        })

    added_boxes = [m.box for _, m in added]
    orphans = [o for o in assoc.orphans if not any(a.x0 <= o.cx <= a.x1 and a.y0 <= (o.y0 + o.y1) / 2 <= a.y1
                                                   for a in added_boxes)]
    issues += [f"label with no object found: {b.name!r} at {b.box.as_list()}" for b in assoc.unmatched]
    issues += [f"object with no label at {o.as_list()} (name it with corrections.toml [[add]])" for o in orphans]
    if art:
        issues.append(f"ignored {len(art)} text fragments printed on objects: " + ", ".join(repr(c.text) for c in art))
    read = [o for o in occurrences if o["origin"] == "board"]
    stats = {"labels": len(read), "matched": sum(1 for o in read if o["crop"]),
             "handAdded": len(occurrences) - len(read), "issues": issues}
    return occurrences, stats


def run_catalog() -> int:
    boards_cfg = load_toml("boards.toml")
    corrections = Corrections.from_dict(load_toml("corrections.toml"))
    rules = FamilyRules.from_dict(load_toml("families.toml"))

    shutil.rmtree(paths.CROPS, ignore_errors=True)
    occurrences, boards, report = [], [], {"boards": {}}
    for board in sorted(paths.REFERENCE.glob("*.png")):
        settings = board_settings(boards_cfg, board.name)
        entry = {"file": board.name, "slug": slugify(board.stem), "role": settings["role"], "labels": 0, "matched": 0,
                 "handAdded": 0}
        if settings["role"] == "catalogue":
            occs, stats = catalogue_board(board, settings, corrections)
            occurrences += occs
            entry.update(labels=stats["labels"], matched=stats["matched"], handAdded=stats["handAdded"])
            report["boards"][board.name] = stats
            print(f"{board.name}: {stats['labels']} labels, {stats['matched']} matched, {len(stats['issues'])} issues")
        else:
            print(f"{board.name}: {settings['role']} board, skipped")
        boards.append(entry)

    items = build_catalogue(occurrences, rules)
    catalogue = {"schemaVersion": 1, "boards": boards, "items": items}
    paths.SHARED_CATALOGUE.parent.mkdir(parents=True, exist_ok=True)
    paths.SHARED_CATALOGUE.write_text(json.dumps(catalogue, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    kinds = Counter(i["kind"] for i in items)
    report["coverage"] = {"items": len(items), **kinds, "families": Counter(i["family"] for i in items if i["family"])}
    unused = corrections.unused()
    report["unusedCorrections"] = unused
    paths.REPORT.parent.mkdir(parents=True, exist_ok=True)
    paths.REPORT.write_text(json.dumps(report, indent=1), encoding="utf-8")
    write_review_page(paths.REVIEW_PAGE, catalogue, report)
    shutil.rmtree(paths.SPRITES, ignore_errors=True)
    sprites = write_sprites(items, paths.REPO / "apps" / "web" / "public", paths.SPRITES, paths.SPRITES_URL,
                            paths.SHARED_SPRITES, frozenset(load_toml("sprites.toml").get("open_holes", [])))
    print(f"{len(items)} items: {dict(kinds)} -> {paths.SHARED_CATALOGUE.relative_to(paths.REPO)}")
    print(f"{sprites} reference sprites -> {paths.SPRITES.relative_to(paths.REPO)}")
    print(f"review page: {paths.REVIEW_PAGE.relative_to(paths.REPO)}")
    for entry in unused:
        print(f"UNUSED correction (never matched; check spelling and OCR characters): {entry}")
    return 1 if unused else 0


def assemble_builds(catalogue: dict, specs: list[dict], results: dict, rules: FamilyRules, reviews: dict,
                    baseline: dict) -> dict:
    """QA every built part (measuring its GLB) into the builds manifest the app reads."""
    items = {i["id"]: i for i in catalogue["items"]}
    entries, failures = [], []
    for spec in specs:
        result = results.get(spec["id"])
        glb_path, _ = build.outputs(spec["id"])
        if not result or not result["ok"] or not glb_path.exists():
            failures.append({"id": spec["id"], "error": (result or {}).get("error") or "not built for this spec; run build"})
            continue
        measured = measure_glb(glb_path)
        build_hash = geometry_hash(glb_path)
        qa = evaluate(items[spec["id"]], rules.families[spec["family"]], result, measured)
        entries.append({
            "id": spec["id"],
            "family": spec["family"],
            "model": f"{paths.MODELS_URL}/{spec['id']}.glb",
            "thumb": {"url": f"{paths.THUMBS_URL}/{spec['id']}.png", "width": result["thumb"]["width"],
                      "height": result["thumb"]["height"]},
            "targetM": result["target"],
            "measuredM": {a: round(v, 4) for a, v in measured["size"].items()},
            "tris": result["tris"],
            "bytes": measured["bytes"],
            "qa": qa["verdict"],
            "checks": qa["checks"],
            "review": review_status(spec["id"], spec["hash"], build_hash, reviews, baseline),
            "reviewNote": reviews.get(spec["id"], {}).get("note", ""),
            "specHash": spec["hash"],
            "buildHash": build_hash,
        })
    return {"schemaVersion": 1, "pxPerM": build.PX_PER_M, "items": entries, "failures": failures}


def publish_builds(catalogue: dict, specs: list[dict], results: dict, rules: FamilyRules) -> int:
    reviews = json.loads(paths.REVIEWS.read_text(encoding="utf-8")) if paths.REVIEWS.exists() else {}
    baseline = (json.loads(paths.REVIEW_BASELINE.read_text(encoding="utf-8"))
                if paths.REVIEW_BASELINE.exists() else {})
    builds = assemble_builds(catalogue, specs, results, rules, reviews, baseline)
    paths.SHARED_BUILDS.write_text(json.dumps(builds, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    footprints = {b["id"]: [b["measuredM"][a] for a in "wdh"] for b in builds["items"]}
    paths.SHARED_FOOTPRINTS.parent.mkdir(parents=True, exist_ok=True)
    paths.SHARED_FOOTPRINTS.write_text(json.dumps({"schemaVersion": 1, "parts": footprints}) + "\n", encoding="utf-8")
    write_build_review(paths.BUILD_REVIEW_PAGE, catalogue, builds, reviews)
    verdicts = Counter(b["qa"] for b in builds["items"])
    print(f"QA: {dict(verdicts)}; build failures: {len(builds['failures'])}")
    for f in builds["failures"]:
        print(f"  FAILED {f['id']}: {f['error'].strip().splitlines()[-1]}")
    print(f"builds -> {paths.SHARED_BUILDS.relative_to(paths.REPO)}; review sheet -> "
          f"{paths.BUILD_REVIEW_PAGE.relative_to(paths.REPO)}")
    return 1 if builds["failures"] else 0


def _catalogue_and_rules() -> tuple[dict, list[dict], FamilyRules]:
    catalogue = json.loads(paths.SHARED_CATALOGUE.read_text(encoding="utf-8"))
    return catalogue, build_specs(catalogue), FamilyRules.from_dict(load_toml("families.toml"))


def run_build() -> int:
    catalogue, specs, rules = _catalogue_and_rules()
    write_textures(paths.TEXTURES)   # before the build cache key is taken: the maps are part of the kit
    return publish_builds(catalogue, specs, build.run(specs), rules)


def run_qa() -> int:
    """QA from the ledger only: parts whose spec or kit changed since their last build, or whose
    outputs are missing, are reported as not built."""
    catalogue, specs, rules = _catalogue_and_rules()
    return publish_builds(catalogue, specs, build.cached_results(specs), rules)


def run_tests() -> int:
    suite = unittest.defaultTestLoader.discover(str(paths.PIPELINE / "tests"), top_level_dir=str(paths.PIPELINE))
    return 0 if unittest.TextTestRunner(verbosity=1).run(suite).wasSuccessful() else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("stage", choices=["catalog", "build", "qa", "all", "test"])
    args = parser.parse_args()
    if args.stage == "all":
        return run_catalog() or run_build()
    return {"catalog": run_catalog, "build": run_build, "qa": run_qa, "test": run_tests}[args.stage]()


if __name__ == "__main__":
    sys.exit(main())
