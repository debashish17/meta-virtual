"""OCR words -> cells -> label blocks and section headers. Pure functions.

Board conventions handled here:
- Caption labels: an item name (plus an optional dims line) printed *under* the object.
- Setup titles: an UPPERCASE title plus a sentence-case subtitle printed *over* a composite
  (e.g. "SINGLE WORKSTATION" / "Individual desk setup"); its dims line, if any, sits under
  the object.
- Section headers: any other UPPERCASE line ("COFFEE TABLES").
"""

from __future__ import annotations

import re
import statistics
from dataclasses import dataclass

from .boxes import Box, union_all

GAP_FACTOR = 1.6          # a word gap wider than this many word heights separates two labels
ART_TEXT_HEIGHT = 1.6     # text taller than this x median text height is artwork ("FIRE", "EXIT")
MIN_MM, MAX_MM = 5, 12000


@dataclass(frozen=True)
class Word:
    text: str
    box: Box


@dataclass(frozen=True)
class Cell:
    text: str
    box: Box
    words: tuple[Word, ...] = ()


@dataclass(frozen=True)
class Dims:
    values_mm: tuple[int, ...]
    diameter: bool
    text: str
    range_mm: tuple[int, int] | None = None
    axis: str | None = None  # "h" / "w" / "d" when a word names the axis ("Height: 700 mm")


@dataclass(frozen=True)
class Section:
    text: str
    box: Box


@dataclass(frozen=True)
class LabelBlock:
    name: str
    raw_name: str
    box: Box            # label text region (name + dims for captions, title + subtitle for setups)
    name_box: Box
    dims: Dims | None
    placement: str      # "above": object is above the label; "below": object is below the title
    subtitle: str | None
    section: str | None
    dims_text: str | None = None
    dims_box: Box | None = None


def split_line(words: list[Word]) -> list[Cell]:
    groups, current = [], [words[0]]
    for a, b in zip(words, words[1:]):
        if b.box.x0 - a.box.x1 > GAP_FACTOR * max(a.box.h, b.box.h):
            groups.append(current)
            current = [b]
        else:
            current.append(b)
    groups.append(current)
    groups = [part for g in groups for part in _split_trailing_dims(g)]
    return [_cell(g) for g in groups]


def _cell(words: list[Word] | tuple[Word, ...]) -> Cell:
    return Cell(" ".join(w.text for w in words), union_all([w.box for w in words]), tuple(words))


def split_cell(cell: Cell, word_counts: list[int]) -> list[Cell] | None:
    """Split a cell holding several labels OCR read as one ([[split]] in corrections.toml)."""
    if sum(word_counts) != len(cell.words) or any(n <= 0 for n in word_counts):
        return None
    parts, start = [], 0
    for n in word_counts:
        parts.append(_cell(cell.words[start:start + n]))
        start += n
    return parts


# --- dimensions ----------------------------------------------------------------------------

_DIGITLIKE = {"O": "0", "o": "0", "C": "0", "c": "0", "S": "5", "s": "5", "I": "1", "l": "1", "|": "1", "g": "9"}
_SEP = re.compile(r"([xX×])")
_UNIT_SUFFIX = re.compile(r"(mm|m)$", re.I)


def _is_numeric_part(part: str) -> bool:
    core = _UNIT_SUFFIX.sub("", part) if not _UNIT_SUFFIX.fullmatch(part) else ""
    return bool(core) and all(ch.isdigit() or ch in _DIGITLIKE for ch in core)


def _repair_part(part: str) -> str:
    m = _UNIT_SUFFIX.search(part)
    cut = m.start() if m and m.start() > 0 else len(part)
    return "".join(_DIGITLIKE.get(ch, ch) for ch in part[:cut]) + part[cut:]


def repair_numeric(text: str) -> str:
    """Fix OCR letter/digit confusions inside dimension tokens ("SOO" -> "500")."""
    tokens = text.replace("'", "").replace('"', "").split(" ")
    out = []
    for i, tok in enumerate(tokens):
        parts = _SEP.split(tok)
        values = parts[::2]
        prev = tokens[i - 1].lower() if i else ""
        nxt = tokens[i + 1].lower() if i + 1 < len(tokens) else ""
        has_digit = any(ch.isdigit() for ch in tok)
        in_dims_context = prev in ("x", "×") or nxt in ("x", "×", "mm", "m")
        numeric = [p for p in values if p]
        if numeric and all(_is_numeric_part(p) for p in numeric) and (has_digit or in_dims_context):
            out.append("".join("x" if j % 2 else _repair_part(p) for j, p in enumerate(parts)))
        else:
            out.append(tok)
    return " ".join(out)


_NUM = r"\d+(?:\.\d+)?"
_VALUE = rf"{_NUM}(?:\s*[-–]\s*{_NUM})?(?:\s*/\s*{_NUM})*"
_DIMS = re.compile(rf"(?P<dia>dia\.?\s*)?(?P<vals>{_VALUE}(?:\s*[x×]\s*{_VALUE})*)(?:\s*(?P<unit>mm|m)\b)?", re.I)
_FRAGMENT = re.compile(rf"^\s*(?:\d{{3,}}\s*[x×]?|[x×]\s*{_NUM}.*(?:mm|m)|mm)\s*$", re.I)
_AXIS_WORD = re.compile(r"\b(height|width|depth)\s*:?\s*$", re.I)


def _dims_match(repaired: str) -> tuple[re.Match, Dims] | None:
    """First run of numbers that reads as dimensions: needs a unit, or at least two x-separated values."""
    for m in _DIMS.finditer(repaired):
        unit = (m.group("unit") or "").lower()
        raws = re.split(r"\s*[x×]\s*", m.group("vals"))
        if not unit and len(raws) < 2:
            continue
        scale = 1000 if unit == "m" else 1
        values, range_mm = [], None
        for raw in raws:
            first = re.split(r"\s*/\s*", raw)[0]
            bounds = [float(v) * scale for v in re.split(r"\s*[-–]\s*", first)]
            if len(bounds) == 2:
                range_mm = (round(bounds[0]), round(bounds[1]))
            values.append(round(bounds[0]))
        if all(MIN_MM <= v <= MAX_MM for v in values):
            word = _AXIS_WORD.search(repaired[:m.start()])
            axis = word.group(1)[0].lower() if word and len(values) == 1 else None
            return m, Dims(tuple(values), bool(m.group("dia")), m.group(0).strip(), range_mm, axis)
    return None


def parse_dims(text: str) -> Dims | None:
    found = _dims_match(repair_numeric(text))
    return found[1] if found else None


def _split_trailing_dims(words: list[Word]) -> list[list[Word]]:
    """'Fabric BOX 3SO x 300 x 300' -> name words + dims words (OCR put both on one line)."""
    for i in range(1, len(words)):
        head = " ".join(w.text for w in words[:i])
        if ":" in head or head.strip().lower().rstrip(".") == "dia":
            return [words]
        tail = repair_numeric(" ".join(w.text for w in words[i:]))
        if not (tail[:1].isdigit() or tail.lower().startswith("dia")):
            continue
        found = _dims_match(tail)
        if found and found[0].start() == 0 and classify(head) in ("name", "header"):
            return [words[:i], words[i:]]
    return [words]


# --- classification ------------------------------------------------------------------------

def classify(text: str) -> str:
    repaired = repair_numeric(text)
    if parse_dims(repaired) or _FRAGMENT.match(repaired):
        return "dims"
    letters = [c for c in text if c.isalpha()]
    if len(letters) < 2:
        return "noise"
    # headers are all-caps word for word; labels like "UPS Unit" or "HDMI / USB-C Hub" are not
    if len(letters) >= 3 and not any(c.islower() for c in letters):
        return "header"
    return "name"


def title_case(text: str) -> str:
    def cap(tok: str) -> str:
        i = next((k for k, ch in enumerate(tok) if ch.isalnum()), len(tok))
        return tok[:i] + tok[i:i + 1].upper() + tok[i + 1:].lower()

    return " ".join(cap(t) for t in text.split(" "))


# --- block assembly ------------------------------------------------------------------------

def _same_column(a: Box, b: Box) -> bool:
    return a.x_overlap(b) >= 0.5 * min(a.w, b.w) or abs(a.x0 - b.x0) <= 6


def header_extent(s: Section, sections: list[Section]) -> tuple[float, float]:
    """Horizontal span a section header governs: from its left edge to the next header on its band."""
    right = min((t.box.x0 for t in sections if t is not s and abs(t.box.y0 - s.box.y0) <= 20 and t.box.x0 > s.box.x0),
                default=float("inf"))
    return s.box.x0, right - 10


def section_above(box: Box, sections: list[Section]) -> Section | None:
    """Lowest header above `box` whose extent holds box.cx."""
    best = None
    for s in sections:
        lo, hi = header_extent(s, sections)
        if s.box.y1 > box.y0 + 2 or not lo <= box.cx < hi:
            continue
        if best is None or s.box.y1 > best.box.y1:
            best = s
    return best


def build_blocks(cells: list[Cell], issues: list[str] | None = None) -> tuple[list[Section], list[LabelBlock]]:
    issues = issues if issues is not None else []
    kinds = [classify(c.text) for c in cells]
    text_heights = [c.box.h for c, k in zip(cells, kinds) if k in ("name", "header")]
    median_h = statistics.median(text_heights) if text_heights else 10.0

    def text_sized(c: Cell) -> bool:
        return c.box.h <= ART_TEXT_HEIGHT * median_h

    headers = sorted((c for c, k in zip(cells, kinds) if k == "header" and text_sized(c)),
                     key=lambda c: (c.box.y0, c.box.x0))
    names = sorted((c for c, k in zip(cells, kinds) if k == "name" and text_sized(c)),
                   key=lambda c: (c.box.y0, c.box.x0))
    dims_cells = sorted((c for c, k in zip(cells, kinds) if k == "dims"), key=lambda c: (c.box.y0, c.box.x0))

    # Setup titles: a header with a sentence-case subtitle directly underneath, left-aligned.
    titles, section_cells, used = [], [], set()
    for h in headers:
        sub = next((i for i, n in enumerate(names) if i not in used
                    and 0 <= n.box.y0 - h.box.y1 <= 1.2 * h.box.h and abs(n.box.x0 - h.box.x0) <= 8), None)
        if sub is None:
            section_cells.append(h)
        else:
            used.add(sub)
            titles.append((h, names[sub]))
    sections = [Section(c.text, c.box) for c in section_cells]

    # Caption names, merging continuation lines such as "Fabric Divider" / "(Light)".
    captions: list[Cell] = []
    for i, n in enumerate(names):
        if i in used:
            continue
        k = next((k for k in range(len(captions) - 1, -1, -1)
                  if 0 <= n.box.y0 - captions[k].box.y1 <= 0.9 * n.box.h
                  and _same_column(captions[k].box, n.box)), None)
        if k is None:
            captions.append(n)
        else:
            captions[k] = Cell(f"{captions[k].text} {n.text}", captions[k].box.union(n.box))

    # Attach dims cells to the caption right above them, chaining dims split across rows
    # ("1000" / "x 1800 mm") or across a wide gap on one row ("1000" "x 1800 mm").
    attached: dict[int, list[Cell]] = {}
    bottoms = {k: c.box.y1 for k, c in enumerate(captions)}
    orphan_dims: list[Cell] = []

    def continues(k: int, d: Cell) -> bool:
        return any(abs(p.box.y0 - d.box.y0) <= 4 and 0 <= d.box.x0 - p.box.x1 <= 4 * d.box.h
                   for p in attached.get(k, []))

    for d in dims_cells:
        owners = [k for k, c in enumerate(captions)
                  if d.box.y0 >= c.box.y1 - 2 and d.box.y0 - bottoms[k] <= c.box.h
                  and (c.box.x_overlap(d.box) > 0 or abs(c.box.x0 - d.box.x0) <= 8 or continues(k, d))]
        if owners:
            k = max(owners, key=lambda k: (captions[k].box.x_overlap(d.box), -abs(captions[k].box.x0 - d.box.x0)))
            attached.setdefault(k, []).append(d)
            bottoms[k] = max(bottoms[k], d.box.y1)
        else:
            orphan_dims.append(d)

    # Remaining dims usually belong to the setup title above them (printed under the object).
    title_dims: dict[int, list[Cell]] = {}
    for d in orphan_dims:
        above = [t for t, (h, _) in enumerate(titles) if h.box.y1 < d.box.y0 and abs(d.box.x0 - h.box.x0) <= 80]
        if above:
            t = max(above, key=lambda t: titles[t][0].box.y1)
            title_dims.setdefault(t, []).append(d)
        else:
            issues.append(f"dims without a label: {d.text!r} at {d.box.as_list()}")

    def dims_of(parts: list[Cell]) -> tuple[Dims | None, str | None, Box | None]:
        if not parts:
            return None, None, None
        text = " ".join(p.text for p in sorted(parts, key=lambda p: (round(p.box.y0 / 4), p.box.x0)))
        return parse_dims(text), text, union_all([p.box for p in parts])

    blocks = []
    for k, c in enumerate(captions):
        dims, dims_text, dims_box = dims_of(attached.get(k, []))
        box = c.box.union(dims_box) if dims_box else c.box
        sec = section_above(c.box, sections)
        blocks.append(LabelBlock(c.text, c.text, box, c.box, dims, "above", None,
                                 sec.text if sec else None, dims_text, dims_box))
    for t, (h, sub) in enumerate(titles):
        dims, dims_text, dims_box = dims_of(title_dims.get(t, []))
        sec = section_above(h.box, sections)
        blocks.append(LabelBlock(title_case(h.text), h.text, h.box.union(sub.box), h.box, dims, "below",
                                 sub.text, sec.text if sec else None, dims_text, dims_box))
    return sections, blocks
