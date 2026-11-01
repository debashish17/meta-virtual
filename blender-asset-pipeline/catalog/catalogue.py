"""Label occurrences -> catalogue items: corrections, family rules, ids and cross-board dedupe.

An *occurrence* is one label found on one board (a dict produced by run.py). Occurrences with
the same category and name merge into one item unless their printed dimensions disagree, in
which case each size becomes its own item with a size-suffixed id.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from .boxes import Box
from .labels import Dims, Word

CATEGORIES = ("architecture", "workstation", "seating", "meeting", "kitchen", "storage", "greenery",
              "tech", "partition", "utility", "lounge", "decor", "lighting")
KINDS = ("part", "composite", "reference")


def slugify(name: str) -> str:
    s = name.lower().replace("&", " and ").replace("+", " plus ")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


@dataclass
class Corrections:
    names: dict[str, str] = field(default_factory=dict)
    board_names: dict[str, dict[str, str]] = field(default_factory=dict)
    dims_map: dict[str, str] = field(default_factory=dict)
    item_dims_map: dict[str, str] = field(default_factory=dict)
    drops: list[tuple[str, str]] = field(default_factory=list)
    adds: list[dict] = field(default_factory=list)
    splits: dict[tuple[str, str], list[int]] = field(default_factory=dict)
    ignores: list[dict] = field(default_factory=list)
    texts: list[dict] = field(default_factory=list)  # printed text OCR missed: board, text, box
    used: set[str] = field(default_factory=set)  # entries that matched something this run

    @classmethod
    def from_dict(cls, data: dict) -> Corrections:
        names = data.get("names", {})
        splits = {(s["board"], s["text"].strip().lower()): list(s["words"]) for s in data.get("split", [])}
        return cls(
            names={k.strip().lower(): v for k, v in names.items() if isinstance(v, str)},
            board_names={board: {k.strip().lower(): v for k, v in table.items()}
                         for board, table in names.items() if isinstance(table, dict)},
            dims_map={k.strip().lower(): v for k, v in data.get("dims", {}).items()},
            item_dims_map={k.strip().lower(): v for k, v in data.get("item_dims", {}).items()},
            drops=[(d.get("board", "*"), d["text"].strip().lower()) for d in data.get("drop", [])],
            adds=list(data.get("add", [])),
            splits=splits,
            ignores=list(data.get("ignore", [])),
            texts=list(data.get("text", [])),
        )

    def _hit(self, entry: str, value):
        if value is not None:
            self.used.add(entry)
        return value

    def split(self, board: str, text: str) -> list[int] | None:
        """Word counts for a cell OCR merged from several adjacent labels."""
        key = text.strip().lower()
        return self._hit(f"[[split]] {board}: {key!r}", self.splits.get((board, key)))

    def name(self, raw: str, board: str = "") -> str:
        key = raw.strip().lower()
        if key in self.board_names.get(board, {}):
            return self._hit(f"[names.{board}] {key!r}", self.board_names[board][key])
        return self._hit(f"[names] {key!r}", self.names.get(key)) or raw

    def dims(self, raw: str | None) -> str | None:
        if not raw:
            return raw
        key = raw.strip().lower()
        return self._hit(f"[dims] {key!r}", self.dims_map.get(key)) or raw

    def item_dims(self, name: str) -> str | None:
        """Authoritative dims text for an item (overrides what OCR read under it)."""
        key = name.strip().lower()
        return self._hit(f"[item_dims] {key!r}", self.item_dims_map.get(key))

    def dropped(self, board: str, text: str) -> bool:
        t = text.strip().lower()
        hit = next((f"[[drop]] {b}: {d!r}" for b, d in self.drops if b in ("*", board) and t == d), None)
        if hit:
            self.used.add(hit)
        return hit is not None

    def missed_text(self, board: str) -> list[list[Word]]:
        """[[text]] entries for `board` as OCR lines, so they are masked out of the artwork and read
        like printed text (a missed section header assigns its items' section)."""
        lines = []
        for t in self.texts:
            if t["board"] != board:
                continue
            self.used.add(f"[[text]] {board}: {t['text'].strip().lower()!r}")
            x0, y0, x1, y1 = t["box"]
            words = t["text"].split()
            gap = 0.5 * (x1 - x0) / max(1, sum(len(w) for w in words) + len(words) - 1)  # half a character
            per_char = (x1 - x0 - gap * (len(words) - 1)) / sum(len(w) for w in words)
            line, x = [], x0
            for w in words:
                line.append(Word(w, Box(x, y0, x + per_char * len(w), y1)))
                x += per_char * len(w) + gap
            line[-1] = Word(line[-1].text, Box(line[-1].box.x0, y0, x1, y1))
            lines.append(line)
        return lines

    def unused(self) -> list[str]:
        """Entries that never matched: a typo or an OCR change made them silent no-ops."""
        entries = [f"[names] {k!r}" for k in self.names]
        entries += [f"[names.{b}] {k!r}" for b, table in self.board_names.items() for k in table]
        entries += [f"[dims] {k!r}" for k in self.dims_map] + [f"[item_dims] {k!r}" for k in self.item_dims_map]
        entries += [f"[[split]] {b}: {t!r}" for b, t in self.splits]
        entries += [f"[[drop]] {b}: {d!r}" for b, d in self.drops]
        entries += [f"[[text]] {t['board']}: {t['text'].strip().lower()!r}" for t in self.texts]
        return [e for e in entries if e not in self.used]


@dataclass(frozen=True)
class Family:
    id: str
    category: str
    kind: str
    dims: str             # axis order for printed values, e.g. "wd" for rugs, "wh" for doors
    tris: int = 10000     # triangle budget enforced by QA
    qa_h: str = "exact"   # "min" when the printed height covers only part of the asset
    qa_wd: str = "exact"  # "min" when greenery may spread past the printed footprint


@dataclass(frozen=True)
class Rule:
    pattern: re.Pattern
    family: str | None
    kind: str | None
    params: dict
    category: str | None
    section: re.Pattern | None
    dims: str | None  # overrides the family's dims order for this rule


@dataclass
class FamilyRules:
    families: dict[str, Family]
    rules: list[Rule]
    sections: list[tuple[re.Pattern, str]]
    boards: dict[str, str]

    @classmethod
    def from_dict(cls, data: dict) -> FamilyRules:
        families = {k: Family(k, v["category"], v.get("kind", "part"), v.get("dims", "wdh"),
                              int(v.get("tris", 10000)), v.get("qa_h", "exact"), v.get("qa_wd", "exact"))
                    for k, v in data.get("families", {}).items()}
        rules = []
        for r in data.get("rule", []):
            if r.get("family") and r["family"] not in families:
                raise ValueError(f"rule {r['match']!r} names unknown family {r['family']!r}")
            rules.append(Rule(re.compile(r["match"]), r.get("family"), r.get("kind"), r.get("params", {}),
                              r.get("category"), re.compile(r["section"]) if r.get("section") else None,
                              r.get("dims")))
        for f in families.values():
            _check_category(f.category, f"family {f.id}")
        sections = [(re.compile(k), _check_category(v, f"section {k}")) for k, v in data.get("sections", {}).items()]
        boards = {k: _check_category(v, f"board {k}") for k, v in data.get("boards", {}).items()}
        return cls(families, rules, sections, boards)

    def fallback_category(self, section: str | None, board: str) -> str:
        sec = (section or "").lower()
        for pattern, category in self.sections:
            if pattern.search(sec):
                return category
        return self.boards.get(board, "decor")

    def classify(self, name: str, section: str | None, board: str) -> dict:
        normalised = name.lower()
        for rule in self.rules:
            if not rule.pattern.search(normalised):
                continue
            if rule.section and not rule.section.search((section or "").lower()):
                continue
            if rule.family:
                fam = self.families[rule.family]
                return {"kind": fam.kind, "family": fam.id, "params": dict(rule.params),
                        "category": rule.category or fam.category, "dims": rule.dims or fam.dims}
            return {"kind": rule.kind or "reference", "family": None, "params": {},
                    "category": rule.category or self.fallback_category(section, board), "dims": "wdh"}
        return {"kind": "reference", "family": None, "params": {},
                "category": self.fallback_category(section, board), "dims": "wdh"}


def _check_category(category: str, where: str) -> str:
    if category not in CATEGORIES:
        raise ValueError(f"{where}: unknown category {category!r}")
    return category


def dims_mm(dims: Dims | None, order: str) -> dict | None:
    """Map printed values onto w/d/h. Three values are w x d x h unless the order is a 3-letter
    permutation ("whd"); for one or two values the order applies ("wd", "wh", "h", or
    "wh_max": the larger value is the height)."""
    if dims is None:
        return None
    values = list(dims.values_mm)
    if dims.diameter:
        values = [values[0], *values]
    out = {"w": None, "d": None, "h": None}
    if dims.axis and len(values) == 1:  # the label names the axis: "Height: 700 mm"
        out[dims.axis] = values[0]
        return out
    if order == "wh_max" and len(values) == 2:
        out["w"], out["h"] = min(values), max(values)
        return out
    if len(values) >= 3:
        axes = order if sorted(order) == ["d", "h", "w"] else "wdh"
    else:
        axes = "wdh" if order == "wh_max" or len(order) == 3 else order
    for axis, v in zip(axes, values):
        out[axis] = v
    return out


def _size_suffix(d: dict) -> str:
    return "x".join(str(d[a]) for a in "wdh" if d[a] is not None)


def build_catalogue(occurrences: list[dict], rules: FamilyRules) -> list[dict]:
    groups: dict[tuple[str, str], list[tuple[dict, dict]]] = defaultdict(list)
    for occ in occurrences:
        cls = rules.classify(occ["name"], occ["section"], occ["board"])
        groups[(cls["category"], slugify(occ["name"]))].append((occ, cls))

    items = []
    for (category, slug), members in groups.items():
        sized = [(o, c, dims_mm(o["dims"], c["dims"])) for o, c in members]
        sizes = Counter(tuple(d.items()) for _, _, d in sized if d)
        if len(sizes) <= 1:
            items.append(_item(f"{category}.{slug}", sized))
            continue
        common = tuple(sizes.most_common(1)[0][0])
        by_size: dict[tuple, list] = defaultdict(list)
        for o, c, d in sized:
            by_size[tuple(d.items()) if d else common].append((o, c, d))
        for key, subset in by_size.items():
            items.append(_item(f"{category}.{slug}-{_size_suffix(dict(key))}", subset))
    return sorted(items, key=lambda i: i["id"])


def _item(item_id: str, members: list[tuple[dict, dict, dict | None]]) -> dict:
    members = sorted(members, key=lambda m: (m[0]["board"], m[0]["label_box"][1], m[0]["label_box"][0]))
    occ, cls, _ = members[0]
    sized = next(((o, d) for o, _, d in members if d), (None, None))
    return {
        "id": item_id,
        "name": occ["name"],
        "category": cls["category"],
        "kind": cls["kind"],
        "family": cls["family"],
        "params": cls["params"],
        "dimsMm": sized[1],
        "dimsText": sized[0]["dims_text"] if sized[0] else None,
        "dimsOrigin": sized[0]["dims_origin"] if sized[0] else None,  # "label" or "correction"
        "subtitle": occ["subtitle"],
        "sources": [{
            "board": o["board"],
            "section": o["section"],
            "rawLabel": o["raw_name"],
            "origin": o["origin"],  # "board" (read by OCR) or "hand" (named in corrections.toml)
            "labelBox": o["label_box"],
            "itemBox": o["item_box"],
            "crop": o["crop"],
        } for o, _, _ in members],
    }
