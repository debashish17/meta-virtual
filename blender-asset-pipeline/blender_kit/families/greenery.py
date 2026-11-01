"""Plants and planters (Lounge PLANTS & PLANTERS, Storage PLANTS & GREEN DIVIDERS, Partitions
PLANTER DIVIDERS, Workstation and Kitchenette plants). Pots and troughs are hollow with soil below
the rim; foliage is fitted to the target box while pots keep their proportions. A planter's
printed height is its box, so its greenery rises above it (QA checks height as a minimum)."""

import math

from ..materials import mat
from ..parts import rod, slab
from .common import casters
from .foliage import SPECIES, fit, pot, potted, trailing, bushy

# (w, d, h) overall, pot height and pot width as fractions of the plant (measured on the boards)
PLANT_SIZES = {"small": ((0.3, 0.3, 0.42), 0.36, 0.46), "medium": ((0.6, 0.6, 0.85), 0.33, 0.42),
               "large": ((0.9, 0.9, 1.45), 0.28, 0.38)}
LEAVES = {"small": 1.0, "medium": 1.5, "large": 2.0}       # leaf count multiplier on the species default
NARROW = {"snake": 0.7, "rosette": 0.85}                     # species that grow narrower than their pot class
DEFAULT_COUNT = {"broadleaf": 14, "bushy": 26, "fern": 28, "snake": 14, "rosette": 18}
FOLIAGE_RISE = 0.42
SPILL = 0.06            # greenery hangs this far past a trough's walls, as on the boards
POTS = ("ceramic_white", "concrete_light", "charcoal")


def plant(dims, p, root, rng):
    if p.get("hanging"):
        return _hanging(dims, p, root, rng)
    size_class = p.get("size", "medium")
    (w0, d0, h0), pot_h, pot_w = PLANT_SIZES[size_class]
    species = p.get("species", "bushy")
    narrow = NARROW.get(species, 1.0)
    w, d, h = dims.fill(w0 * narrow, d0 * narrow, h0)
    potted(root, rng, 0.0, 0.0, 0.0, w, d, h, species, p.get("pot", "square"), p.get("pot_material", "ceramic_white"),
           float(p.get("pot_h", pot_h)), pot_w / narrow ** 0.5, count=round(DEFAULT_COUNT[species] * LEAVES[size_class]))
    return w, d, h


def _hanging(dims, p, root, rng):
    """Bowl on three cords from a ceiling hook, a dome of leaves and vines hanging below."""
    w, d, h = dims.fill(0.4, 0.4, 0.75)
    half = min(w, d) * 0.3
    pot_z, pot_h = h * 0.4, h * 0.17
    soil = pot(root, 0.0, 0.0, pot_z, half, pot_h, "bowl", p.get("pot_material", "ceramic_white"))
    rim = pot_z + pot_h
    for i in range(3):
        a = 2 * math.pi * i / 3 + math.pi / 6
        rod(root, mat("kraft"), (half * 0.97 * math.cos(a), half * 0.97 * math.sin(a), rim), (0, 0, h - 0.03), 0.003, segments=4)
    rod(root, mat("black_metal"), (0, 0, h - 0.035), (0, 0, h), 0.006, segments=6)
    leaves = bushy(root, rng, 0.0, 0.0, soil, (h - 0.1 - soil) * 0.45, min(w, d) * 0.4, count=30)
    leaves += trailing(root, rng, 0.0, 0.0, rim, half * 0.95, rim + 0.02, vines=12)
    fit(leaves, (-w / 2, w / 2), (-d / 2, d / 2), z_min=0.0)
    return w, d, h


def tub(root, material, x, y, z, wall=0.02, soil_drop=0.05):
    """Open-topped trough: floor, four walls and soil set `soil_drop` below the rim. Returns the
    soil height."""
    slab(root, mat(material), x, y, (z[0], z[0] + wall), bevel=0.003)
    slab(root, mat(material), x, (y[0], y[0] + wall), z, bevel=0.003)
    slab(root, mat(material), x, (y[1] - wall, y[1]), z, bevel=0.003)
    slab(root, mat(material), (x[0], x[0] + wall), (y[0] + wall, y[1] - wall), z, bevel=0.003)
    slab(root, mat(material), (x[1] - wall, x[1]), (y[0] + wall, y[1] - wall), z, bevel=0.003)
    soil = z[1] - soil_drop
    slab(root, mat("soil"), (x[0] + wall, x[1] - wall), (y[0] + wall, y[1] - wall), (soil - 0.02, soil))
    return soil


def planted_tub(root, rng, x, y, z, material, rise=FOLIAGE_RISE, wall=0.02, spill=SPILL):
    """A trough packed with greenery the way the boards draw them: clumps every ~22 cm, mostly
    leafy with the odd fern, filling the trough's footprint and rising `rise` above the rim."""
    soil = tub(root, material, x, y, z, wall)
    width, depth = x[1] - x[0], y[1] - y[0]
    clumps = max(1, round(width / 0.16))
    leaves = []
    for i in range(clumps):
        cx = x[0] + (i + 0.5) * width / clumps
        cy = (y[0] + y[1]) / 2 + rng.uniform(-0.2, 0.2) * depth / 2
        grow = SPECIES["fern"] if rng.random() < 0.2 else SPECIES["bushy"]
        leaves += grow(root, rng, cx, cy, soil, rise * rng.uniform(0.8, 1.1) + (z[1] - soil),
                       max(width / clumps, depth) * 0.6, count=12 if grow is SPECIES["fern"] else 24)
    fit(leaves, (x[0] - spill, x[1] + spill), (y[0] - spill, y[1] + spill), z[1] + rise, z_floor=soil, z_min=soil - 0.02)
    return soil


def _doors(root, x, y_face, outward, z, count):
    """Oak door panels with 6 mm shadow gaps on one face of a cabinet base."""
    span = (x[1] - x[0]) / count
    y = (y_face, y_face + 0.018 * outward)
    for i in range(count):
        x0 = x[0] + i * span + 0.003
        slab(root, mat("oak"), (x0, x0 + span - 0.006), (min(y), max(y)), z, bevel=0.002)


def _shelf_bay(root, rng, x, y, z, bay_h):
    """One shelf bay of potted plants in assorted pots, sizes and species (Partitions board,
    SHELF WITH PLANTER)."""
    depth = y[1] - y[0]
    cursor = x[0] + rng.uniform(0.02, 0.08)
    while cursor < x[1] - 0.12:
        half = min(depth * 0.36, rng.uniform(0.05, 0.1))
        plant_w = min(2 * half / 0.5, depth, x[1] - 0.02 - cursor)
        if plant_w < 2 * half + 0.02:
            break
        cx, cy = cursor + plant_w / 2, (y[0] + y[1]) / 2
        species = rng.choice(("bushy", "bushy", "broadleaf", "snake", "fern", "rosette"))
        height = bay_h * (rng.uniform(0.7, 0.92) if species != "snake" else 0.92)
        potted(root, rng, cx, cy, z, plant_w, plant_w, height, species,
               rng.choice(("square", "round")), rng.choice(POTS), rng.uniform(0.32, 0.45), 2 * half / plant_w,
               count={"bushy": 16, "broadleaf": 8, "snake": 7, "fern": 12, "rosette": 12}[species])
        cursor += plant_w + rng.uniform(0.04, 0.16)


def planter(dims, p, root, rng):
    base = p.get("base", "box")
    w, d, h = dims.fill(*{"cabinet": (1.2, 0.3, 1.2), "shelf": (1.2, 0.3, 1.2)}.get(base, (0.8, 0.3, 0.3)))
    lift = 0.06 if p.get("casters") else 0.0
    if p.get("casters"):
        casters(root, w, d)
    if base == "cabinet":
        trough_h = min(0.3, h * 0.35)
        frame = mat(p.get("frame", "charcoal"))
        body = (lift, h - trough_h)
        slab(root, frame, (-w / 2, w / 2), (-d / 2 + 0.018, d / 2 - 0.018), body, bevel=0.004)
        doors = max(2, round(w / 0.45))
        door_z = (lift + 0.05, h - trough_h - 0.02)
        _doors(root, (-w / 2 + 0.02, w / 2 - 0.02), -d / 2 + 0.018, -1, door_z, doors)
        _doors(root, (-w / 2 + 0.02, w / 2 - 0.02), d / 2 - 0.018, 1, door_z, doors)
        slab(root, frame, (-w / 2, w / 2), (-d / 2, d / 2), (lift, lift + 0.05), bevel=0.003)   # plinth
        planted_tub(root, rng, (-w / 2, w / 2), (-d / 2, d / 2), (h - trough_h, h), p.get("trough", "charcoal"))
    elif base == "shelf":
        bar = 0.025
        for sx in (-1, 1):
            for sy in (-1, 1):
                slab(root, mat("black_metal"), (sx * (w / 2 - bar / 2) - bar / 2, sx * (w / 2 - bar / 2) + bar / 2),
                     (sy * (d / 2 - bar / 2) - bar / 2, sy * (d / 2 - bar / 2) + bar / 2), (lift, h))
        levels = max(2, round(h / 0.4))
        bay = (h - lift - 0.045) / levels
        for i in range(levels + 1):
            z = lift + 0.02 + i * bay
            slab(root, mat("oak"), (-w / 2, w / 2), (-d / 2, d / 2), (z, z + 0.025), bevel=0.003)
            if i < levels:
                _shelf_bay(root, rng, (-w / 2 + bar, w / 2 - bar), (-d / 2 + 0.01, d / 2 - 0.01), z + 0.025, bay - 0.03)
    elif p.get("tall"):  # a tall hollow pot with a plant in it (Storage board, TALL PLANTER)
        half = min(w, d) / 2
        soil = pot(root, 0.0, 0.0, lift, half, h - lift, "square", p.get("pot_material", "concrete_light"), taper=0.86)
        rise = h * 0.75
        leaves = SPECIES["bushy"](root, rng, 0.0, 0.0, soil, rise + (h - soil), half, count=34)
        leaves += SPECIES["broadleaf"](root, rng, 0.0, 0.0, soil, rise + (h - soil), half, count=6)
        fit(leaves, (-w / 2 - 2 * SPILL, w / 2 + 2 * SPILL), (-d / 2 - 2 * SPILL, d / 2 + 2 * SPILL), h + rise,
            z_floor=soil, z_min=soil - 0.05)
    else:
        planted_tub(root, rng, (-w / 2, w / 2), (-d / 2, d / 2), (lift, h), p.get("trough", "charcoal"))
    return w, d, h
