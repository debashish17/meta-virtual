"""Assign segmented object components to label blocks. Pure functions on boxes.

Captions own the components directly above them (down from the previous label row or the
section header). A component wide enough to cover several caption centres on one row (touching
rugs, sofas) is cut at the midpoints between those centres. Setup titles own the components
below them, between the title and the next header (or their own trailing dims line).

Vertical limits test a component's centre, not its edges: tall objects often poke above their
section header, and setup images overlap their own titles and dims lines.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from .boxes import Box, union_all
from .labels import LabelBlock, Section, header_extent, section_above

ROW_TOLERANCE = 14        # px: captions whose tops differ by less than this share a row
ORPHAN_MIN_AREA = 1500
ORPHAN_MIN_SIDE = 25
OVERHANG = 24             # px an object (legs, shadow) may reach below the top of its own caption


@dataclass(frozen=True)
class Match:
    box: Box
    parts: tuple[Box, ...]


@dataclass
class Association:
    items: dict[LabelBlock, Match] = field(default_factory=dict)
    unmatched: list[LabelBlock] = field(default_factory=list)
    orphans: list[Box] = field(default_factory=list)


def _rows(captions: list[LabelBlock]) -> list[list[LabelBlock]]:
    rows: list[list[LabelBlock]] = []
    for b in sorted(captions, key=lambda b: b.name_box.y0):
        if rows and b.name_box.y0 - rows[-1][0].name_box.y0 <= ROW_TOLERANCE:
            rows[-1].append(b)
        else:
            rows.append([b])
    return [sorted(r, key=lambda b: b.box.cx) for r in rows]


def _caption_columns(row: list[LabelBlock]) -> dict[LabelBlock, tuple[float, float]]:
    cols = {}
    for i, b in enumerate(row):
        gaps = [abs(row[j].box.cx - b.box.cx) for j in (i - 1, i + 1) if 0 <= j < len(row)]
        edge = max(min(gaps) / 2, 0.75 * b.box.w + 20) if gaps else max(1.5 * b.box.w, 120)
        left = (row[i - 1].box.cx + b.box.cx) / 2 if i > 0 else b.box.cx - edge
        right = (row[i + 1].box.cx + b.box.cx) / 2 if i + 1 < len(row) else b.box.cx + edge
        cols[b] = (left, right)
    return cols


def _title_columns(titles: list[LabelBlock], sections: list[Section], width: float) -> dict[LabelBlock, tuple[float, float]]:
    cols = {}
    for t in titles:
        same_band = [u.box.x0 for u in titles if u is not t and abs(u.box.y0 - t.box.y0) <= 20 and u.box.x0 > t.box.x0]
        side_headers = [s.box.x0 for s in sections if s.box.x0 > t.box.x0 and -60 <= s.box.y0 - t.box.y0 <= 40]
        right = min(same_band + side_headers, default=width + 20)
        cols[t] = (t.box.x0 - 20, right - 20)
    return cols


def associate(blocks: list[LabelBlock], sections: list[Section], components: list[Box],
              board_size: tuple[int, int]) -> Association:
    width, height = board_size
    result = Association()
    labels = list(blocks)
    captions = [b for b in labels if b.placement == "above"]
    titles = [b for b in labels if b.placement == "below"]

    rows = _rows(captions)
    row_of = {b: r for r in rows for b in r}
    columns = {b: col for r in rows for b, col in _caption_columns(r).items()}
    columns.update(_title_columns(titles, sections, width))

    def ceiling(b: LabelBlock) -> float:
        lo, hi = columns[b]
        sec = section_above(b.name_box, sections)
        limits = [sec.box.y1] if sec else [0.0]
        limits += [o.box.y1 for o in labels
                   if o is not b and o.box.y1 <= b.name_box.y0 - 2 and o.box.x1 > lo and o.box.x0 < hi]
        return max(limits)

    def floor(t: LabelBlock) -> float:
        if t.dims_box is not None and t.dims_box.y0 > t.box.y1:
            return t.dims_box.y1
        lo, hi = columns[t]
        below = [s.box.y0 for s in sections if s.box.y0 > t.box.y1
                 and header_extent(s, sections)[1] > lo and header_extent(s, sections)[0] < hi]
        return min(below, default=float(height))

    caption_window = {b: (ceiling(b), b.name_box.y0) for b in captions}
    title_window = {t: (t.box.y1, floor(t)) for t in titles}

    def in_caption_window(c: Box, cy: float, b: LabelBlock) -> bool:
        top, bottom = caption_window[b]
        return top < cy < bottom and c.y1 <= b.box.y1 + OVERHANG

    owned: dict[LabelBlock, list[Box]] = defaultdict(list)
    claimed: set[int] = set()
    for idx, c in enumerate(components):
        candidates = []  # (priority, gap, distance, block)
        cy = (c.y0 + c.y1) / 2
        for b, (top, bottom) in caption_window.items():
            lo, hi = columns[b]
            spans = c.x0 <= b.box.cx <= c.x1
            if (lo <= c.cx <= hi or spans) and in_caption_window(c, cy, b):
                candidates.append((0, max(0.0, bottom - c.y1), abs(c.cx - b.box.cx), b))
        for t, (top, bottom) in title_window.items():
            lo, hi = columns[t]
            if lo <= c.cx <= hi and top < cy < bottom:
                candidates.append((1, cy - top, abs(c.cx - t.box.cx), t))
        if not candidates:
            continue
        claimed.add(idx)
        _, _, _, owner = min(candidates, key=lambda k: k[:3])
        if owner.placement == "below":
            # touching setup images on one band: cut at the title column boundaries
            band = sorted((t for t in titles if abs(t.box.y0 - owner.box.y0) <= 20
                           and min(c.x1, columns[t][1]) - max(c.x0, columns[t][0])
                           >= 0.25 * (columns[t][1] - columns[t][0])
                           and title_window[t][0] < cy < title_window[t][1]),
                          key=lambda t: t.box.x0)
            if len(band) < 2:
                owned[owner].append(c)
                continue
            edges = [c.x0, *(columns[t][0] for t in band[1:]), c.x1]
            for t, lo, hi in zip(band, edges, edges[1:]):
                owned[t].append(c.clip_x(lo, hi))
            continue
        covered = [b for b in row_of[owner] if c.x0 <= b.box.cx <= c.x1 and in_caption_window(c, cy, b)]
        if len(covered) < 2:
            owned[owner].append(c)
            continue
        cuts = [(a.box.cx + b.box.cx) / 2 for a, b in zip(covered, covered[1:])]
        edges = [c.x0, *cuts, c.x1]
        for b, lo, hi in zip(covered, edges, edges[1:]):
            owned[b].append(c.clip_x(lo, hi))

    for b in labels:
        parts = owned.get(b)
        if parts:
            result.items[b] = Match(union_all(parts), tuple(parts))
        else:
            result.unmatched.append(b)
    result.orphans = [c for i, c in enumerate(components) if i not in claimed
                      and c.area >= ORPHAN_MIN_AREA and min(c.w, c.h) >= ORPHAN_MIN_SIDE]
    return result
