"""Pots and plants for every greenery asset (Lounge, Meeting, Kitchenette, Workstation and Storage
boards). Pots are hollow vessels with soil set below the rim; plants are made of real leaf blades
in the species the boards show; foliage is fitted to its target box without touching the pot.
"""

import math

from ..materials import mat
from ..parts import lathe, leaf, rod

SQRT2 = math.sqrt(2.0)
GREENS = ("leaf", "leaf", "leaf_dark", "leaf_light")


def pot(root, cx, cy, z0, half, height, shape="square", material="ceramic_white", taper=0.82,
        wall=None, soil_drop=None):
    """Hollow pot: `half` is the rim's half-width (square) or radius (round). Returns the soil
    height. The soil sits `soil_drop` below the rim so the rim reads as a vessel, not a block."""
    wall = wall or max(0.006, half * 0.07)
    soil_drop = soil_drop or max(0.012, height * 0.1)
    top, soil = z0 + height, z0 + height - soil_drop
    inner_top = half - wall
    inner_soil = inner_top - (half - half * taper) * soil_drop / height
    k, segments, turn = (SQRT2, 4, math.pi / 4) if shape == "square" else (1.0, 28, 0.0)
    if shape == "bowl":
        profile = [(0.0, z0), (half * 0.55, z0 + height * 0.04), (half * 0.86, z0 + height * 0.3),
                   (half, top - height * 0.08), (half, top), (inner_top, top),
                   (inner_soil, soil), (0.0, soil)]
    else:
        profile = [(0.0, z0), (half * taper, z0), (half, top), (inner_top, top), (inner_soil, soil), (0.0, soil)]
    lathe(root, mat(material), [(r * k, z) for r, z in profile], cx, cy, segments, turn)
    lathe(root, mat("soil"), [(inner_soil * k, soil), (inner_soil * k * 0.5, soil + 0.004), (0.0, soil + 0.006)],
          cx, cy, segments, turn, sharp_deg=80)
    return soil


def _stem(root, a, b, r):
    return rod(root, mat("stem"), a, b, r, segments=5)


def broadleaf(root, rng, cx, cy, z0, height, spread, count=10, petiole=0.5):
    """Large ovate leaves on petioles from a central crown, low ones reaching out, high ones
    upright, so the plant is full from rim to top (peace lily, rubber plant)."""
    parts = []
    for i in range(count):
        yaw = 2 * math.pi * i * 0.618 + rng.uniform(-0.2, 0.2)   # golden-angle spiral, no gaps
        lift = (i + rng.uniform(0.2, 0.8)) / count
        base = (cx, cy, z0 + height * petiole * lift ** 1.2)
        parts.append(_stem(root, (cx, cy, z0), base, 0.002 + height * 0.002))
        # low leaves reach out to the spread, high ones up to the top
        size = (spread * 0.95 * (1 - lift) + height * 0.55 * lift) * rng.uniform(0.85, 1.05)
        parts.append(leaf(root, mat(rng.choice(GREENS)), base, yaw, math.radians(8 + 65 * lift + rng.uniform(-8, 8)),
                          size, size * rng.uniform(0.4, 0.48), "ovate", droop=rng.uniform(0.2, 0.4), fold=0.3,
                          twist=rng.uniform(-0.4, 0.4), segments=7))
    return parts


def bushy(root, rng, cx, cy, z0, height, spread, count=26):
    """Dense dome of mid-size leaves on short stems (philodendron, pothos, planter greenery)."""
    parts = []
    size_base = max(0.05, min(0.16, (height + spread) * 0.28))
    for i in range(count):
        yaw = rng.uniform(0, 2 * math.pi)
        layer = rng.random()  # 0 = outer skirt, 1 = crown
        out = spread * (0.15 + 0.5 * (1 - layer)) * rng.uniform(0.6, 1.0)
        base = (cx + math.cos(yaw) * out * 0.5, cy + math.sin(yaw) * out * 0.5, z0 + height * (0.05 + 0.5 * layer))
        parts.append(rod(root, mat("stem"), (cx, cy, z0), base, 0.002, segments=3))  # hidden in a dense bush
        size = size_base * rng.uniform(0.75, 1.15)
        parts.append(leaf(root, mat(rng.choice(GREENS)), base, yaw, math.radians(5 + 60 * layer + rng.uniform(-10, 10)),
                          size, size * rng.uniform(0.5, 0.62), rng.choice(("ovate", "heart")),
                          droop=rng.uniform(0.25, 0.5), fold=0.25, twist=rng.uniform(-0.6, 0.6), segments=5))
    return parts


def fern(root, rng, cx, cy, z0, height, spread, count=22):
    """Arching lobed fronds from a central crown (Boston fern)."""
    parts = []
    for i in range(count):
        yaw = 2 * math.pi * i / count + rng.uniform(-0.25, 0.25)
        rise = rng.uniform(0.6, 1.0)
        size = (height + spread) * 0.7 * rng.uniform(0.75, 1.0)
        parts.append(leaf(root, mat(rng.choice(GREENS)), (cx, cy, z0), yaw, math.radians(18 + 45 * rise), size,
                          size * 0.26, "frond", droop=rng.uniform(0.35, 0.5), fold=0.15, segments=18))
    return parts


def snake(root, rng, cx, cy, z0, height, spread, count=10):
    """Upright sword leaves, slightly twisted (Sansevieria)."""
    parts = []
    for i in range(count):
        yaw = 2 * math.pi * i / count + rng.uniform(-0.4, 0.4)
        out = spread * rng.uniform(0.0, 0.35)
        base = (cx + math.cos(yaw) * out * 0.3, cy + math.sin(yaw) * out * 0.3, z0)
        size = height * rng.uniform(0.75, 1.0)
        parts.append(leaf(root, mat(rng.choice(("leaf_snake", "leaf_snake", "leaf_light"))), base, yaw,
                          math.radians(rng.uniform(74, 88)), size, size * rng.uniform(0.09, 0.12), "sword",
                          droop=0.02, fold=0.45, twist=rng.uniform(-1.0, 1.0), segments=6))
    return parts


def rosette(root, rng, cx, cy, z0, height, spread, count=18):
    """Stiff pointed leaves fanning out from the soil (aloe, spiky desk plants)."""
    parts = []
    for i in range(count):
        yaw = 2 * math.pi * i / count + rng.uniform(-0.2, 0.2)
        inner = i % 2
        size = (height if inner else (height + spread) * 0.55) * rng.uniform(0.8, 1.0)
        parts.append(leaf(root, mat(rng.choice(GREENS)), (cx, cy, z0), yaw,
                          math.radians(rng.uniform(62, 80) if inner else rng.uniform(35, 55)), size,
                          size * 0.16, "lance", droop=0.05, fold=0.5, segments=5))
    return parts


def trailing(root, rng, cx, cy, z0, r, drop, vines=8):
    """Vines spilling over a rim at radius `r` and hanging `drop` below it, with heart leaves."""
    parts = []
    for i in range(vines):
        yaw = 2 * math.pi * i / vines + rng.uniform(-0.25, 0.25)
        length = drop if i == 0 else drop * rng.uniform(0.55, 1.0)   # the longest one reaches the bottom
        x0, y0 = cx + math.cos(yaw) * r, cy + math.sin(yaw) * r
        sway = rng.uniform(0.02, 0.06)
        steps = max(3, int(length / 0.045))
        prev = (x0, y0, z0)
        for k in range(1, steps + 1):
            t = k / steps
            point = (x0 + math.cos(yaw) * sway * t, y0 + math.sin(yaw) * sway * t, z0 + 0.02 - length * t)
            parts.append(rod(root, mat("stem"), prev, point, 0.002, segments=4))
            side = yaw + (1 if k % 2 else -1) * 1.2
            size = 0.035 + 0.025 * (1 - t) * rng.uniform(0.6, 1.0)
            parts.append(leaf(root, mat(rng.choice(GREENS)), point, side, math.radians(-20), size, size * 0.8,
                              "heart", droop=0.2, fold=0.2, segments=3))
            prev = point
    return parts


SPECIES = {"broadleaf": broadleaf, "bushy": bushy, "fern": fern, "snake": snake, "rosette": rosette}


def fit(parts, x, y, z_top=None, z_floor=None, z_min=0.0):
    """Size foliage so its extents land on x=(x0, x1), y=(y0, y1) and reach z_top (if given):
    first a uniform scale about the crown (leaf shapes stay true), then a small per-side stretch
    about the plant's own centre so the stems stay where they grow from. Pots are never in
    `parts`, so they keep their proportions. Nothing ends below z_min."""
    verts = [v for obj in parts for v in obj.data.vertices]
    if not verts:
        return
    cx, cy = (x[0] + x[1]) / 2, (y[0] + y[1]) / 2

    def extents():
        return [min(v.co[a] for v in verts) for a in range(3)], [max(v.co[a] for v in verts) for a in range(3)]

    # 1) uniform scale about the crown by the mean of the needed factors: leaves keep their shape
    lo, hi = extents()
    base = lo[2] if z_floor is None else z_floor
    needed = [(x[1] - x[0]) / max(hi[0] - lo[0], 1e-6), (y[1] - y[0]) / max(hi[1] - lo[1], 1e-6)]
    if z_top is not None:
        needed.append((z_top - base) / max(hi[2] - base, 1e-6))
    uniform = math.prod(needed) ** (1 / len(needed))
    lift = uniform if z_top is not None else 1.0   # no height target (hanging): leave heights alone
    for v in verts:
        v.co.x, v.co.y, v.co.z = cx + (v.co.x - cx) * uniform, cy + (v.co.y - cy) * uniform, base + (v.co.z - base) * lift
    # 2) the small remainder per side and axis, so the extents land exactly
    lo, hi = extents()
    for axis, centre, (t0, t1) in ((0, cx, x), (1, cy, y)):
        down = (centre - t0) / max(centre - lo[axis], 1e-6)
        up = (t1 - centre) / max(hi[axis] - centre, 1e-6)
        for v in verts:
            d = v.co[axis] - centre
            v.co[axis] = centre + d * (up if d > 0 else down)
    scale = 1.0 if z_top is None else (z_top - base) / max(hi[2] - base, 1e-6)
    for v in verts:
        v.co[2] = max(z_min, base + (v.co[2] - base) * scale)
    for obj in parts:
        obj.data.update()


def potted(root, rng, cx, cy, z0, w, d, h, species="bushy", pot_shape="square", pot_material="ceramic_white",
           pot_h=0.36, pot_w=0.46, count=None):
    """A potted plant filling w x d x h from (cx, cy, z0): the pot takes `pot_h` of the height and
    `pot_w` of the width, the foliage the rest."""
    half = min(w, d) * pot_w / 2
    soil = pot(root, cx, cy, z0, half, h * pot_h, pot_shape, pot_material)
    grow = SPECIES[species]
    parts = grow(root, rng, cx, cy, soil, z0 + h - soil, min(w, d) / 2, **({"count": count} if count else {}))
    fit(parts, (cx - w / 2, cx + w / 2), (cy - d / 2, cy + d / 2), z0 + h, z_floor=soil, z_min=z0 + 0.01)
    return parts
