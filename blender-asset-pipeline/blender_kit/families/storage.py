"""Cabinets and shelving (Storage board, Kitchenette COUNTER & CABINETS, Workstation MOBILE STORAGE)."""

from ..materials import mat
from ..parts import slab
from .common import casters, handle_h, handle_v, post, shell
from .foliage import potted

PLINTH = 0.08
FRONT = 0.018
WORKTOP = 0.03


def _doors(root, x, y_front, z, count, material, glass=False):
    step = (x[1] - x[0]) / count
    for i in range(count):
        dx = (x[0] + i * step + 0.003, x[0] + (i + 1) * step - 0.003)
        if glass:
            for side in ((dx[0], dx[0] + 0.03), (dx[1] - 0.03, dx[1])):
                slab(root, material, side, (y_front, y_front + FRONT), z)
            for edge in ((z[0], z[0] + 0.03), (z[1] - 0.03, z[1])):
                slab(root, material, dx, (y_front, y_front + FRONT), edge)
            slab(root, mat("glass"), (dx[0] + 0.03, dx[1] - 0.03), (y_front + 0.006, y_front + 0.012),
                 (z[0] + 0.03, z[1] - 0.03))
        else:
            slab(root, material, dx, (y_front, y_front + FRONT), z, bevel=0.003)
        hx = dx[1] - 0.04 if i % 2 == 0 and count > 1 else dx[0] + 0.04
        span = min(0.18, (z[1] - z[0]) * 0.3)
        hz = (z[1] - 0.05 - span, z[1] - 0.05) if z[1] - z[0] < 1.0 else (z[0] + 0.85 - span / 2, z[0] + 0.85 + span / 2)
        handle_v(root, hx, y_front, hz)


def _drawers(root, x, y_front, z, material):
    count = max(2, min(5, round((z[1] - z[0]) / 0.25)))
    step = (z[1] - z[0]) / count
    for i in range(count):
        dz = (z[0] + i * step + 0.003, z[0] + (i + 1) * step - 0.003)
        slab(root, material, x, (y_front, y_front + FRONT), dz, bevel=0.003)
        mid = (x[0] + x[1]) / 2
        handle_h(root, (mid - min(0.12, (x[1] - x[0]) * 0.3), mid + min(0.12, (x[1] - x[0]) * 0.3)), y_front, dz[1] - 0.04)


def _lockers(root, x, y_front, z, material, columns, rows):
    cw, rh = (x[1] - x[0]) / columns, (z[1] - z[0]) / rows
    for c in range(columns):
        for r in range(rows):
            dx = (x[0] + c * cw + 0.003, x[0] + (c + 1) * cw - 0.003)
            dz = (z[0] + r * rh + 0.003, z[0] + (r + 1) * rh - 0.003)
            slab(root, material, dx, (y_front, y_front + FRONT), dz, bevel=0.003)
            for k in range(3):
                vz = dz[1] - 0.05 - k * 0.02
                slab(root, mat("charcoal"), (dx[0] + 0.04, dx[1] - 0.04), (y_front - 0.002, y_front), (vz - 0.006, vz))
            handle_v(root, dx[1] - 0.04, y_front, (dz[0] + rh * 0.4, dz[0] + rh * 0.4 + 0.08))


def cabinet(dims, p, root, rng):
    fronts = p.get("fronts", "doors")
    if p.get("wall"):
        w, d, h = dims.fill(0.6, 0.35, 0.7)
    elif p.get("corner"):
        w, d, h = dims.fill(0.9, 0.9, 0.9)
    elif p.get("worktop"):
        w, d, h = dims.fill(0.6, 0.6, 0.9)
    elif fronts == "lockers":
        w, d, h = dims.fill(0.3 * int(p.get("columns", 1)), 0.5, 1.8)
    elif p.get("casters"):
        w, d, h = dims.fill(0.4, 0.5, 0.6)
    elif fronts == "drawers":
        w, d, h = dims.fill(0.45, 0.62, 1.02)
    else:
        w, d, h = dims.fill(0.8, 0.4, 1.2)
    carcass = mat(p.get("carcass", "oak"))  # board cabinets are oak all round unless stated
    face = mat(p.get("face", "oak"))
    base = 0.0 if p.get("wall") else (0.06 if p.get("casters") else PLINTH)
    top = h - (WORKTOP if p.get("worktop") else 0.0)
    y_front = -d / 2 + 0.02  # fronts set back so handles end flush with the stated depth

    if p.get("casters"):
        casters(root, w, d)
    elif base:
        slab(root, mat("charcoal"), (-w / 2 + 0.03, w / 2 - 0.03), (-d / 2 + 0.05, d / 2 - 0.02), (0.0, base))

    if p.get("corner"):
        run = min(0.6, d * 0.66)
        slab(root, carcass, (-w / 2, w / 2), (y_front + FRONT, -d / 2 + run), (base, top), bevel=0.003)
        slab(root, carcass, (-w / 2, -w / 2 + run), (-d / 2 + run, d / 2), (base, top), bevel=0.003)
        _doors(root, (-w / 2 + run, w / 2), y_front, (base + 0.01, top - 0.01), 1, face)
        if p.get("worktop"):
            slab(root, mat("stone_black"), (-w / 2, w / 2), (-d / 2, -d / 2 + run), (top, h), bevel=0.004)
            slab(root, mat("stone_black"), (-w / 2, -w / 2 + run), (-d / 2 + run, d / 2), (top, h), bevel=0.004)
        return w, d, h

    if fronts == "glass":
        shell(root, carcass, (-w / 2, w / 2), (y_front + FRONT, d / 2), (base, top))
    else:
        slab(root, carcass, (-w / 2, w / 2), (y_front + FRONT, d / 2), (base, top), bevel=0.003)
    inner = (-w / 2 + 0.006, w / 2 - 0.006)
    fz = (base + 0.006, top - 0.006)
    if fronts == "drawers":
        _drawers(root, inner, y_front, fz, face)
    elif fronts == "lockers":
        rows = int(p.get("rows", 2 if h > 1.2 else 1))
        _lockers(root, inner, y_front, fz, face, int(p.get("columns", 1)), rows)
    elif fronts == "panel":
        slab(root, face, (-w / 2, w / 2), (y_front, y_front + FRONT), (base, top), bevel=0.003)
    else:
        count = 1 if w <= 0.5 else max(2, round(w / 0.45))
        if fronts == "glass":  # shelves and boxes inside the open shell, visible through the doors
            shelves = max(2, round((top - base) / 0.38))
            cavity_y = (y_front + FRONT + 0.01, d / 2 - 0.02)
            for i in range(1, shelves):
                z = base + i * (top - base) / shelves
                slab(root, mat("off_white"), (-w / 2 + 0.018, w / 2 - 0.018), cavity_y, (z - 0.01, z))
                slab(root, mat("kraft"), (-0.15, 0.1), (cavity_y[0] + 0.03, cavity_y[1] - 0.03),
                     (z, z + min(0.2, (top - base) / shelves - 0.05)))
        _doors(root, inner, y_front, fz, count, face, glass=fronts == "glass")

    if p.get("worktop"):
        slab(root, mat("stone_black"), (-w / 2, w / 2), (-d / 2, d / 2), (top, h), bevel=0.004)
        if p.get("sink"):
            slab(root, mat("stainless"), (-w * 0.32, w * 0.32), (-d * 0.28, d * 0.22), (h - 0.004, h))
            slab(root, mat("charcoal"), (-w * 0.27, w * 0.27), (-d * 0.24, d * 0.18), (h - 0.006, h - 0.002))
    return w, d, h


def _dress_bay(root, rng, x, y, z):
    """Boxes, books or a small plant on one shelf bay, kept inside the bay."""
    bay_w, bay_h = x[1] - x[0], z[1] - z[0]
    if bay_h < 0.12 or bay_w < 0.2:
        return
    cursor = x[0] + 0.03
    while cursor < x[1] - 0.12:
        pick = rng.random()
        if pick < 0.35:
            bw = min(0.26, x[1] - cursor - 0.02)
            slab(root, mat("kraft"), (cursor, cursor + bw), (y[0] + 0.03, y[1] - 0.03), (z[0], z[0] + min(0.2, bay_h * 0.7)),
                 bevel=0.004)
            cursor += bw + 0.04
        elif pick < 0.7:
            for _ in range(rng.randint(4, 8)):
                if cursor > x[1] - 0.05:
                    break
                bh = min(bay_h * 0.85, rng.uniform(0.18, 0.26))
                colour = rng.choice(("off_white", "charcoal", "grey_light", "oak_dark", "warm_white"))
                slab(root, mat(colour), (cursor, cursor + 0.03), (y[0] + 0.04, y[1] - 0.05), (z[0], z[0] + bh))
                cursor += 0.034
            cursor += 0.05
        elif pick < 0.85:
            size = min(0.2, y[1] - y[0] - 0.04, x[1] - cursor - 0.02)
            if size >= 0.1:
                potted(root, rng, cursor + size / 2, (y[0] + y[1]) / 2, z[0], size, size, min(0.32, bay_h * 0.8),
                       rng.choice(("bushy", "broadleaf", "snake")), rng.choice(("square", "round")),
                       rng.choice(("ceramic_white", "concrete_light", "charcoal")), 0.4, 0.55, count=9)
            cursor += size + 0.08
        else:
            cursor += 0.12


def shelf(dims, p, root, rng):
    if p.get("wall"):
        w, d, h = dims.fill(0.8, 0.22, 0.25)
    elif p.get("casters"):
        w, d, h = dims.fill(0.6, 0.4, 0.9)
    else:
        w, d, h = dims.fill(0.8, 0.35, 1.8)
    frame, board = mat(p.get("frame", "black_metal")), mat(p.get("board", "oak"))
    if p.get("wall"):  # two tiers on wall rails, spanning the printed height
        for z in (0.0, h - 0.025):
            slab(root, board, (-w / 2, w / 2), (-d / 2, d / 2), (z, z + 0.025), bevel=0.003)
        for sx in (-1, 1):
            x = sx * (w / 2 - 0.01)
            slab(root, frame, (x - 0.01, x + 0.01), (d / 2 - 0.02, d / 2), (0.0, h))
        _dress_bay(root, rng, (-w / 2 + 0.02, w / 2 - 0.02), (-d / 2, d / 2), (0.025, h - 0.025))
        return w, d, h

    base = 0.06 if p.get("casters") else 0.0
    if p.get("casters"):
        casters(root, w, d)
    bar = 0.025
    for sx in (-1, 1):
        for sy in (-1, 1):
            post(root, frame, sx * (w / 2 - bar / 2), sy * (d / 2 - bar / 2), (base, h), bar)
    levels = max(2, round((h - base) / 0.38)) + 1
    zs = [base + 0.04 + i * (h - base - 0.065) / (levels - 1) for i in range(levels)]
    for z in zs:
        slab(root, board, (-w / 2 + 0.005, w / 2 - 0.005), (-d / 2 + 0.005, d / 2 - 0.005), (z, z + 0.025), bevel=0.003)
        for sx in (-1, 1):
            slab(root, frame, (sx * (w / 2 - bar / 2) - bar / 2, sx * (w / 2 - bar / 2) + bar / 2),
                 (-d / 2, d / 2), (z - 0.02, z))
    if p.get("dressing", True):
        for z0, z1 in zip(zs, zs[1:]):
            _dress_bay(root, rng, (-w / 2 + bar, w / 2 - bar), (-d / 2, d / 2), (z0 + 0.025, z1 - 0.025))
    return w, d, h
