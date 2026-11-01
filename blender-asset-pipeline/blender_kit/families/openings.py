"""Doors and windows (Doors board INTERIOR DOORS, DOOR FRAMES, WINDOW TYPES; Meeting DOORS & ENTRY).

Board scale key: door height ~2.4 m, single door width ~1.0 m. Windows are self-contained units
from z=0; layouts lift them to sill height.
"""

from ..materials import mat
from ..parts import slab
from .common import handle_v
from .greenery import planted_tub

JAMB = 0.05


def _leaf(root, kind, x, y, z):
    black = mat("black_metal")
    if kind in ("glass", "frosted"):
        stile = 0.045
        for edge in ((x[0], x[0] + stile), (x[1] - stile, x[1])):
            slab(root, black, edge, y, z)
        slab(root, black, x, y, (z[0], z[0] + 0.1))
        slab(root, black, x, y, (z[1] - stile, z[1]))
        slab(root, mat("glass" if kind == "glass" else "frosted"), (x[0] + stile, x[1] - stile),
             (sum(y) / 2 - 0.006, sum(y) / 2 + 0.006), (z[0] + 0.1, z[1] - stile))
        return
    face = mat({"dark": "charcoal", "acoustic": "felt_grey"}.get(kind, "oak"))
    slab(root, face, x, y, z, bevel=0.004)
    if kind == "vision":
        slab(root, mat("glass"), (x[1] - 0.2, x[1] - 0.12), (y[0] - 0.001, y[1] + 0.001), (z[0] + 0.5, z[1] - 0.3))
    elif kind == "louvers":
        for i in range(12):
            zz = z[0] + 0.4 + i * 0.09
            slab(root, mat("oak_dark"), (x[0] + 0.12, x[1] - 0.12), (y[0] - 0.003, y[0]), (zz, zz + 0.04))
    elif kind == "wood_glass":
        slab(root, mat("glass"), (x[0] + 0.1, x[1] - 0.1), (y[0] - 0.001, y[1] + 0.001), (z[0] + 0.5, z[1] - 0.15))


def door(dims, p, root, rng):
    leaves = int(p.get("leaves", 1))
    kind = p.get("leaf", "wood")
    w, d, h = dims.fill(1.0 if leaves == 1 else 1.8, 0.1, 2.4)
    frame = mat(p.get("frame", "black_metal"))
    slab(root, frame, (-w / 2, -w / 2 + JAMB), (-d / 2, d / 2), (0.0, h))
    slab(root, frame, (w / 2 - JAMB, w / 2), (-d / 2, d / 2), (0.0, h))
    slab(root, frame, (-w / 2, w / 2), (-d / 2, d / 2), (h - JAMB, h))
    if kind == "none":
        return w, d, h
    track = bool(p.get("track"))
    leaf_y = (-d / 2 + 0.022, -d / 2 + 0.062) if track else (-0.02, 0.02)
    if track:
        slab(root, mat("black_metal"), (-w / 2, w / 2), (-d / 2, -d / 2 + 0.03), (h - JAMB - 0.04, h - JAMB))
    span = (w - 2 * JAMB) / leaves
    for i in range(leaves):
        x = (-w / 2 + JAMB + i * span + 0.003, -w / 2 + JAMB + (i + 1) * span - 0.003)
        _leaf(root, kind, x, leaf_y, (0.005, h - JAMB - (0.04 if track else 0.003)))
        hx = x[1] - 0.06 if i == 0 else x[0] + 0.06
        reach = (0.7, 1.6) if kind in ("glass", "frosted") else (1.0, 1.12)
        handle_v(root, hx, leaf_y[0], reach)
    return w, d, h


def window(dims, p, root, rng):
    style = p.get("style", "standard")
    w, d, h = dims.fill({"large": 2.0, "corner": 1.4}.get(style, 1.2), 0.3 if p.get("planters") else 0.12,
                        {"floor": 2.4}.get(style, 1.4))
    black = mat("black_metal")
    pane = mat("frosted" if p.get("frosted") else "glass")
    # frame at the back; the sill (and any planter box) sits in front of it, inside the depth
    fy = (d / 2 - 0.12, d / 2) if p.get("planters") else (-d / 2 + 0.04, d / 2)

    def unit(x, y):
        for edge in ((x[0], x[0] + JAMB), (x[1] - JAMB, x[1])):
            slab(root, black, edge, y, (0.0, h))
        slab(root, black, x, y, (0.0, JAMB))
        slab(root, black, x, y, (h - JAMB, h))
        mullions = max(0, round((x[1] - x[0]) / 0.9) - 1)
        for k in range(1, mullions + 1):
            mx = x[0] + k * (x[1] - x[0]) / (mullions + 1)
            slab(root, black, (mx - 0.02, mx + 0.02), y, (0.0, h))
        mid = sum(y) / 2
        slab(root, pane, (x[0] + JAMB, x[1] - JAMB), (mid - 0.006, mid + 0.006), (JAMB, h - JAMB))
        if p.get("operable"):
            slab(root, black, (x[0] + JAMB, x[1] - JAMB), (y[0], y[0] + 0.02), (h * 0.6, h * 0.6 + 0.03))
            handle_v(root, sum(x) / 2, y[0], (h * 0.62, h * 0.66))
        if p.get("blinds"):
            for k in range(int(h * 0.5 / 0.05)):
                zz = h - JAMB - 0.02 - k * 0.05
                slab(root, mat("grey_light"), (x[0] + JAMB, x[1] - JAMB), (y[0] + 0.01, y[0] + 0.035), (zz - 0.008, zz))

    if style == "corner":
        unit((-w / 2, w / 2), (-w / 2, -w / 2 + 0.12))
        unit_y = (-w / 2 + 0.12, w / 2)
        for edge in ((unit_y[0], unit_y[0] + JAMB), (unit_y[1] - JAMB, unit_y[1])):
            slab(root, black, (-w / 2, -w / 2 + 0.12), edge, (0.0, h))
        slab(root, black, (-w / 2, -w / 2 + 0.12), unit_y, (0.0, JAMB))
        slab(root, black, (-w / 2, -w / 2 + 0.12), unit_y, (h - JAMB, h))
        slab(root, pane, (-w / 2 + 0.054, -w / 2 + 0.066), (unit_y[0] + JAMB, unit_y[1] - JAMB), (JAMB, h - JAMB))
        return w, w, h
    unit((-w / 2, w / 2), fy)
    slab(root, mat("oak"), (-w / 2, w / 2), (fy[0] - 0.04, fy[0]), (JAMB - 0.02, JAMB), bevel=0.003)
    if p.get("planters"):
        planted_tub(root, rng, (-w / 2 + 0.05, w / 2 - 0.05), (-d / 2, fy[0] - 0.04), (0.0, 0.2), "oak", rise=0.3, wall=0.015,
                    spill=0.0)  # against the glass, inside the window's footprint
    return w, d, h
