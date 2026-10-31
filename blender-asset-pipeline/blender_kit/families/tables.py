"""Tables: oak tops on black bases (coffee, side, casual, dining, meeting, standing, counter)."""

import math

from ..materials import mat
from ..parts import disc, rod, slab
from .common import loop_leg_y, post

HEIGHTS = {"coffee": 0.42, "side": 0.52, "dining": 0.74, "bar": 1.05}
TOP = 0.035


def build(dims, p, root, rng):
    shape, height = p.get("shape", "rect"), p.get("height", "dining")
    z = HEIGHTS.get(height, 0.74)
    if shape == "round":
        size = {"coffee": 0.8, "side": 0.45, "dining": 1.0, "bar": 0.8}.get(height, 1.0)
        w, d, h = dims.fill(size, size, z)
    else:
        w, d, h = dims.fill(*{"coffee": (1.2, 0.6), "side": (0.5, 0.5), "dining": (1.8, 0.9),
                              "bar": (1.6, 0.7)}.get(height, (1.8, 0.9)), z)
    steel = mat("black_metal")
    top = (h - TOP, h)

    if shape == "round":
        r = min(w, d) / 2
        disc(root, mat("oak"), 0, 0, top, r, segments=40)
        if height in ("coffee", "side"):
            for i in range(3 if height == "side" else 4):
                a = 2 * math.pi * i / (3 if height == "side" else 4) + math.pi / 4
                foot = (math.cos(a) * r * 0.78, math.sin(a) * r * 0.78)
                rod(root, steel, (foot[0] * 0.8, foot[1] * 0.8, h - TOP), (foot[0], foot[1], 0.0), 0.014, segments=8)
        else:
            disc(root, steel, 0, 0, (0.0, 0.025), min(r * 0.55, 0.32), segments=28)
            disc(root, steel, 0, 0, (0.025, h - TOP), 0.04, segments=16)
            disc(root, steel, 0, 0, (h - TOP - 0.02, h - TOP), min(r * 0.4, 0.22), segments=20)
        return w, d, h

    slab(root, mat("oak"), (-w / 2, w / 2), (-d / 2, d / 2), top, bevel=0.006)
    if p.get("base") == "trestle":
        for sx in (-1, 1):
            loop_leg_y(root, steel, sx * (w / 2 - min(0.3, w * 0.12)), (-d / 2 + 0.1, d / 2 - 0.1), h - TOP, 0.06)
        slab(root, steel, (-w / 2 + 0.3, w / 2 - 0.3), (-0.03, 0.03), (0.16, 0.2), bevel=0.004)
        return w, d, h
    if height == "bar":  # standing and counter tables: closed loop legs at each end with a foot rail
        for sx in (-1, 1):
            loop_leg_y(root, steel, sx * (w / 2 - 0.06), (-d / 2 + 0.04, d / 2 - 0.04), h - TOP, 0.05)
        for sy in (-1, 1):
            y = sy * (d / 2 - 0.065)
            slab(root, steel, (-w / 2 + 0.085, w / 2 - 0.085), (y - 0.015, y + 0.015), (h - TOP - 0.05, h - TOP),
                 bevel=0.004)
        return w, d, h
    leg = 0.04
    for sx in (-1, 1):
        for sy in (-1, 1):
            post(root, steel, sx * (w / 2 - leg / 2 - 0.03), sy * (d / 2 - leg / 2 - 0.03), (0.0, h - TOP), leg)
    slab(root, steel, (-w / 2 + 0.03, w / 2 - 0.03), (-d / 2 + 0.03, d / 2 - 0.03), (h - TOP - 0.05, h - TOP))
    return w, d, h
