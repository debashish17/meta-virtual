"""Foreground components and transparent item crops for one board.

Text is masked out before connected components, so labels never merge with objects and the
components are pure object pixels. Thin section-divider lines are removed too: where they touch
objects they would chain a whole row of items into one component. Thresholds are RGB distance
from the board background.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image

from .boxes import Box
from .labels import Cell

FOREGROUND = 22        # min distance from background to count as object
ALPHA_LO, ALPHA_HI = 14, 34
TEXT_PAD = 2
MIN_AREA = 60
MIN_SIDE = 4
LINE_MIN_LENGTH = 151  # straight runs at least this long ...
LINE_MAX_THICKNESS = 4  # ... and at most this thick are divider lines
ART_RING = 5           # px ring around a text cell sampled for foreground
ART_DENSITY = 0.5      # share of foreground in that ring that makes the text part of an object


@dataclass
class Segmentation:
    rgb: np.ndarray        # H x W x 3 uint8
    distance: np.ndarray   # H x W float32, distance from background colour
    labels: np.ndarray     # H x W int32 component ids (0 = background)
    boxes: list[Box]       # one per kept component
    ids: list[int]         # component id for each box


def load(board_path) -> tuple[np.ndarray, np.ndarray]:
    rgb = np.asarray(Image.open(board_path).convert("RGB"))
    corners = np.concatenate([rgb[:24, :24], rgb[:24, -24:], rgb[-24:, :24], rgb[-24:, -24:]]).reshape(-1, 3)
    background = np.median(corners, axis=0).astype(np.float32)
    distance = np.linalg.norm(rgb.astype(np.float32) - background, axis=2)
    return rgb, distance


def split_art_text(cells: list[Cell], distance: np.ndarray) -> tuple[list[Cell], list[Cell]]:
    """Separate labels printed on the background from text drawn on objects (menu boards, signs)."""
    height, width = distance.shape
    labels, art = [], []
    for c in cells:
        x0, y0 = max(0, int(c.box.x0) - ART_RING), max(0, int(c.box.y0) - ART_RING)
        x1, y1 = min(width, int(np.ceil(c.box.x1)) + ART_RING), min(height, int(np.ceil(c.box.y1)) + ART_RING)
        ring = np.ones((y1 - y0, x1 - x0), bool)
        ring[int(c.box.y0) - y0:int(np.ceil(c.box.y1)) - y0, int(c.box.x0) - x0:int(np.ceil(c.box.x1)) - x0] = False
        density = float((distance[y0:y1, x0:x1][ring] >= FOREGROUND).mean()) if ring.any() else 0.0
        (art if density >= ART_DENSITY else labels).append(c)
    return labels, art


def _remove_divider_lines(mask: np.ndarray) -> np.ndarray:
    thick_rows = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((LINE_MAX_THICKNESS + 1, 1), np.uint8))
    thick_cols = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((1, LINE_MAX_THICKNESS + 1), np.uint8))
    h_lines = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((1, LINE_MIN_LENGTH), np.uint8)) & ~thick_rows.astype(bool)
    v_lines = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((LINE_MIN_LENGTH, 1), np.uint8)) & ~thick_cols.astype(bool)
    return mask & ~(h_lines.astype(bool) | v_lines.astype(bool))


def segment(rgb: np.ndarray, distance: np.ndarray, text_boxes: list[Box], header_band_px: int) -> Segmentation:
    height, width = distance.shape
    mask = (distance >= FOREGROUND).astype(np.uint8)
    mask[:header_band_px] = 0
    for b in text_boxes:
        mask[max(0, int(b.y0) - TEXT_PAD):int(b.y1) + TEXT_PAD, max(0, int(b.x0) - TEXT_PAD):int(b.x1) + TEXT_PAD] = 0
    mask = _remove_divider_lines(mask).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)

    boxes, ids = [], []
    for i in range(1, count):
        x, y, w, h, area = stats[i]
        divider = (w > 0.4 * width and h < 8) or (h > 0.4 * height and w < 8)
        if area < MIN_AREA or min(w, h) < MIN_SIDE or divider:
            continue
        boxes.append(Box(float(x), float(y), float(x + w), float(y + h)))
        ids.append(i)
    return Segmentation(rgb, distance, labels, boxes, ids)


def crop(seg: Segmentation, parts: tuple[Box, ...], pad: int = 4) -> Image.Image:
    """Transparent crop of the components behind `parts` (clipped boxes from association)."""
    height, width = seg.labels.shape
    box = parts[0]
    for p in parts[1:]:
        box = box.union(p)
    x0, y0 = max(0, int(box.x0) - pad), max(0, int(box.y0) - pad)
    x1, y1 = min(width, int(np.ceil(box.x1)) + pad), min(height, int(np.ceil(box.y1)) + pad)

    member = np.zeros((y1 - y0, x1 - x0), np.uint8)
    window = seg.labels[y0:y1, x0:x1]
    for p in parts:
        ids = [cid for cid, b in zip(seg.ids, seg.boxes) if b.x0 <= p.x1 and b.x1 >= p.x0 and b.y0 <= p.y1 and b.y1 >= p.y0]
        px0, py0 = int(p.x0) - x0, int(p.y0) - y0
        px1, py1 = int(np.ceil(p.x1)) - x0, int(np.ceil(p.y1)) - y0
        member[py0:py1, px0:px1] |= np.isin(window[py0:py1, px0:px1], ids).astype(np.uint8)
    # close small holes left by masked-out text and include anti-aliased rims
    member = cv2.morphologyEx(member, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    member = cv2.dilate(member, np.ones((3, 3), np.uint8))

    ramp = np.clip((seg.distance[y0:y1, x0:x1] - ALPHA_LO) / (ALPHA_HI - ALPHA_LO), 0.0, 1.0)
    alpha = (ramp * member * 255).astype(np.uint8)
    return Image.fromarray(np.dstack([seg.rgb[y0:y1, x0:x1], alpha]), "RGBA")
