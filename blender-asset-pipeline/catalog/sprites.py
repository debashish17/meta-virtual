"""Reference crops -> sprites the office scene places directly (no 3D rebuild).

A crop keeps the board's own colour in its transparent pixels, and the board is one flat colour,
so each pixel can be read against it. Board shadows are that colour darkened, smooth and without
a tint of their own; the object is everything they cannot reach from outside without crossing an
edge. That drops the drop shadows, keeps pale parts the segmentation lost (a white mug, a clock
face) when the object's outline encloses them, and lets edge pixels be separated from the board
colour, so no pale rim is left. Holes enclosed by the object close; gaps reaching the outside stay
clear. Some objects enclose real background (the gap inside a headband): items listed under
`open_holes` in data/sprites.toml keep enclosed board-coloured holes clear.

A crop whose transparent pixels carry no board colour falls back to closing enclosed holes in its
alpha, unchanged.
"""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

OPAQUE = 128
BOARD_DELTA = 12      # max channel difference from the board colour for a hole to count as background
BOARD_MIN = 150       # the boards are pale; darker "transparent" pixels mean no board colour is known
SHADOW_MIN = 0.5      # board shadows are no darker than half the board's brightness ...
NEUTRAL = 7.0         # ... and stay within this RGB distance of the board's own tint
SMOOTH = 5.5          # brightness change per pixel below which a pixel is not an edge
PEEL = 2              # outline pixels in board or shadow tones removed at most this deep
MIN_PART = 0.01       # pieces smaller than this share of the largest are specks
NEIGHBOUR = 0.25      # pieces cut by the crop's edge and smaller than this are the next item's


def _fill(mask: np.ndarray) -> np.ndarray:
    """`mask` with every region it encloses added."""
    free = np.pad(1 - mask.astype(np.uint8), 1, constant_values=1)
    cv2.floodFill(free, np.zeros((free.shape[0] + 2, free.shape[1] + 2), np.uint8), (0, 0), 2)
    return free[1:-1, 1:-1] != 2


def _board_colour(rgba: np.ndarray) -> np.ndarray | None:
    clear = rgba[:, :, 3] == 0
    if clear.sum() < 20:
        return None
    board = np.median(rgba[clear][:, :3].astype(np.float32), axis=0)
    return board if board.min() >= BOARD_MIN else None


def _board_coloured(rgba: np.ndarray, hole: np.ndarray, open_border: np.ndarray) -> bool:
    """Is this enclosed hole mostly the colour of the board around the object?"""
    board = rgba[open_border][:, :3].astype(float)
    if not len(board):
        return False
    distance = np.abs(rgba[hole][:, :3].astype(float) - board.mean(0)).max(1)
    return bool(np.median(distance) < BOARD_DELTA)


def _close_holes(rgba: np.ndarray, open_holes: bool) -> np.ndarray:
    """Fallback without a board colour: make holes the object encloses opaque."""
    solid = rgba[:, :, 3] >= OPAQUE
    holes = _fill(solid) & ~solid
    if open_holes:
        border = np.zeros(holes.shape, bool)
        border[0, :] = border[-1, :] = border[:, 0] = border[:, -1] = True
        count, labels = cv2.connectedComponents(holes.astype(np.uint8), connectivity=4)
        for k in range(1, count):
            hole = labels == k
            if _board_coloured(rgba, hole, border & ~solid):
                holes &= ~hole                            # real background: leave its alpha as cropped
    rgba = rgba.copy()
    rgba[holes, 3] = 255
    return rgba


def _matte(rgba: np.ndarray, board: np.ndarray, open_holes: bool) -> np.ndarray:
    rgb = rgba[:, :, :3].astype(np.float32)
    shade = (rgb @ board) / float(board @ board)                     # brightness relative to the board
    tint = np.linalg.norm(rgb - shade[..., None] * board, axis=2)    # colour the board does not have
    lum = rgb.mean(2)
    edge = np.hypot(cv2.Sobel(lum, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(lum, cv2.CV_32F, 0, 1, ksize=3)) / 8
    boardlike = (tint < NEUTRAL) & (shade >= SHADOW_MIN) & (edge < SMOOTH)

    # flood the board and its shadows in from outside; small gaps in the outline are sealed first
    barrier = cv2.morphologyEx((~boardlike).astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    obj = _fill(barrier.astype(bool))
    obj &=_fill(cv2.dilate((rgba[:, :, 3] > 0).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool))   # stay on the crop's item
    if open_holes:
        count, labels = cv2.connectedComponents((boardlike & obj & (shade > 0.9)).astype(np.uint8), connectivity=4)
        for k in range(1, count):
            if (labels == k).sum() > 30:
                obj &= labels != k

    # drop specks, and slivers of the neighbouring item that the crop's box cut through
    count, labels, stats, _ = cv2.connectedComponentsWithStats(obj.astype(np.uint8), connectivity=8)
    if count > 1:
        largest = stats[1:, cv2.CC_STAT_AREA].max()
        h, w = obj.shape
        for k in range(1, count):
            x, y, ww, hh, area = stats[k]
            cut = x == 0 or y == 0 or x + ww >= w or y + hh >= h
            if area < MIN_PART * largest or (cut and area < NEIGHBOUR * largest):
                obj &= labels != k

    # peel the outline where it is still the board's shadow, or board-white against a darker object
    for _ in range(PEEL):
        u8 = obj.astype(np.uint8)
        inner = cv2.erode(u8, np.ones((3, 3), np.uint8), iterations=2).astype(np.float32)
        near = cv2.boxFilter(shade * inner, -1, (7, 7), normalize=False) / np.maximum(cv2.boxFilter(inner, -1, (7, 7), normalize=False), 1e-3)
        rim = obj & ~cv2.erode(u8, np.ones((3, 3), np.uint8)).astype(bool)
        pale = (tint < NEUTRAL * 1.3) & (shade > 0.6) & ((shade < 0.96) | (near < 0.8))
        obj &= ~(rim & pale)

    # soft edge inside the outline, with the board's share taken out of the edge pixels' colour
    alpha = np.where(obj, cv2.GaussianBlur(obj.astype(np.float32), (0, 0), 0.6), 0)
    a = np.clip(alpha, 0, 1)[..., None]
    colour = np.clip((rgb - (1 - a) * board) / np.maximum(a, 0.25), 0, 255)
    out = np.dstack([colour, a * 255]).round().astype(np.uint8)
    out[a[..., 0] < 0.04] = 0
    return out


def prepare_sprite(crop: Image.Image, open_holes: bool = False) -> Image.Image:
    rgba = np.array(crop.convert("RGBA"))
    board = _board_colour(rgba)
    rgba = _matte(rgba, board, open_holes) if board is not None else _close_holes(rgba, open_holes)
    ys, xs = np.nonzero(rgba[:, :, 3] > 0)
    if len(xs) == 0:
        return Image.fromarray(rgba, "RGBA")
    x0, y0 = max(0, xs.min() - 1), max(0, ys.min() - 1)
    x1, y1 = min(rgba.shape[1], xs.max() + 2), min(rgba.shape[0], ys.max() + 2)
    return Image.fromarray(rgba[y0:y1, x0:x1], "RGBA")


def write_sprites(items: list[dict], web_root: Path, out_dir: Path, url: str, manifest: Path,
                  open_holes: frozenset[str] = frozenset()) -> int:
    """One sprite per reference item that has a crop, plus a manifest the scene sizes them from."""
    out_dir.mkdir(parents=True, exist_ok=True)
    entries = {}
    for item in items:
        if item["kind"] != "reference":
            continue
        crop = next((s["crop"] for s in item["sources"] if s["crop"]), None)
        if not crop:
            continue
        sprite = prepare_sprite(Image.open(web_root / crop.lstrip("/")), open_holes=item["id"] in open_holes)
        sprite.save(out_dir / f"{item['id']}.png")
        entries[item["id"]] = {"url": f"{url}/{item['id']}.png", "px": list(sprite.size), "dimsMm": item["dimsMm"]}
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps({"schemaVersion": 1, "sprites": entries}, indent=1) + "\n", encoding="utf-8")
    return len(entries)
