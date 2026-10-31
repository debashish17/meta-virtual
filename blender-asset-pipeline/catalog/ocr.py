"""Read board text with Windows OCR, strip by strip, cached by image hash.

A whole board at once misses labels (Windows OCR skipped "Standard Desk", "L-Shape Desk", ...)
and merges neighbouring labels into one line. Overlapping horizontal strips upscaled 2x read
every label we checked; duplicate lines from the overlap are resolved by keeping the copy that
sat furthest from its strip's edges.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

from . import paths
from .boxes import Box
from .labels import Word

SCALE = 2
STRIP_HEIGHT = 220
STRIP_STEP = 160
EDGE_PX = 2
CACHE_VERSION = 1


def _load_lines(json_path: Path) -> list[dict]:
    raw = json_path.read_text(encoding="utf-8-sig").strip()
    data = json.loads(raw) if raw else []
    lines = data if isinstance(data, list) else [data]
    for line in lines:  # PowerShell unrolls one-element arrays
        if isinstance(line["words"], dict):
            line["words"] = [line["words"]]
    return lines


def _ocr_image(image: Image.Image, workdir: Path, name: str) -> list[dict]:
    png, out = workdir / f"{name}.png", workdir / f"{name}.json"
    image.save(png)
    proc = subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(paths.WINOCR),
         "-ImagePath", str(png), "-OutJson", str(out)],
        capture_output=True, text=True)
    if proc.returncode != 0 or not out.exists():
        raise RuntimeError(f"Windows OCR failed on {name}: {proc.stderr.strip()[:400]}")
    return _load_lines(out)


def _iou(a: Box, b: Box) -> float:
    ix = a.x_overlap(b)
    iy = max(0.0, min(a.y1, b.y1) - max(a.y0, b.y0))
    inter = ix * iy
    return inter / (a.area + b.area - inter) if inter else 0.0


def _read_strips(board: Path) -> list[list[Word]]:
    image = Image.open(board).convert("RGB")
    width, height = image.size
    candidates = []  # (margin, words, box)
    with tempfile.TemporaryDirectory() as tmp:
        for top in range(0, height, STRIP_STEP):
            bottom = min(height, top + STRIP_HEIGHT)
            strip = image.crop((0, top, width, bottom))
            strip = strip.resize((strip.width * SCALE, strip.height * SCALE), Image.Resampling.LANCZOS)
            for line in _ocr_image(strip, Path(tmp), f"strip_{top}"):
                words = [Word(w["text"], Box(w["x"] / SCALE, top + w["y"] / SCALE,
                                             (w["x"] + w["w"]) / SCALE, top + (w["y"] + w["h"]) / SCALE))
                         for w in line["words"]]
                box = Box(min(w.box.x0 for w in words), min(w.box.y0 for w in words),
                          max(w.box.x1 for w in words), max(w.box.y1 for w in words))
                touches_top = top > 0 and box.y0 - top <= EDGE_PX
                touches_bottom = bottom < height and bottom - box.y1 <= EDGE_PX
                if touches_top or touches_bottom:
                    continue  # cut by the strip edge; the neighbouring strip has it whole
                margin = min(box.y0 - top, bottom - box.y1)
                candidates.append((margin, words, box))
            if bottom == height:
                break
    kept: list[tuple[list[Word], Box]] = []
    for _, words, box in sorted(candidates, key=lambda c: -c[0]):
        if all(_iou(box, other) < 0.3 for _, other in kept):
            kept.append((words, box))
    return [words for words, box in sorted(kept, key=lambda k: (k[1].y0, k[1].x0))]


def read_board(board: Path) -> list[list[Word]]:
    """OCR lines for a board in board pixel coordinates (cached under generated/catalog/ocr)."""
    digest = hashlib.sha256(board.read_bytes()).hexdigest()
    cache = paths.OCR_CACHE / f"{board.stem}.json"
    key = {"sha256": digest, "version": CACHE_VERSION, "scale": SCALE,
           "strip": [STRIP_HEIGHT, STRIP_STEP], "script": hashlib.sha256(paths.WINOCR.read_bytes()).hexdigest()}
    if cache.exists():
        stored = json.loads(cache.read_text(encoding="utf-8"))
        if stored.get("key") == key:
            return [[Word(w["text"], Box(*w["box"])) for w in line] for line in stored["lines"]]
    lines = _read_strips(board)
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps({"key": key, "lines": [[{"text": w.text, "box": w.box.as_list()} for w in line]
                                                       for line in lines]}, indent=1), encoding="utf-8")
    return lines
