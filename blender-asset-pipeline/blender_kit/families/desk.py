"""Desk modules: oak tops on black O-shaped loop legs (Workstation board, DESK MODULES row).

Kit parts are bare desks; monitors, dividers and pedestals are separate catalogue parts that
layouts place on or under them.
"""

from ..materials import mat
from ..parts import slab
from .common import loop_leg_x, loop_leg_y, post

TOP = 0.03
BAR = 0.05
INSET = 0.06


def _legs_along_x(root, w, y, h):
    """Loop legs at both ends, plus a middle pair for long desks."""
    top = h - TOP
    xs = [-w / 2 + INSET, w / 2 - INSET] + ([0.0] if w > 2.0 else [])
    for x in xs:
        loop_leg_y(root, mat("black_metal"), x, y, top, BAR)


def _standing_base(root, w, d, h):
    top = h - TOP
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.18)
        slab(root, mat("black_metal"), (x - 0.035, x + 0.035), (-d / 2 + 0.03, d / 2 - 0.03), (0.0, 0.04), bevel=0.006)
        slab(root, mat("black_metal"), (x - 0.04, x + 0.04), (-0.03, 0.03), (0.04, top * 0.55), bevel=0.004)
        slab(root, mat("black_metal"), (x - 0.032, x + 0.032), (-0.024, 0.024), (top * 0.55, top - 0.03), bevel=0.004)
    slab(root, mat("black_metal"), (-w / 2 + 0.18, w / 2 - 0.18), (-0.03, 0.03), (top - 0.03, top), bevel=0.004)
    slab(root, mat("charcoal"), (w / 2 - 0.32, w / 2 - 0.22), (-d / 2 + 0.03, -d / 2 + 0.08), (top - 0.025, top))


def build(dims, p, root, rng):
    shape = p.get("shape", "rect")
    seats = int(p.get("seats", 1))
    if shape == "l":
        w, d, h = dims.fill(1.6, 1.4, 0.75)
    elif shape == "bench":
        w, d, h = dims.fill(2.6 if seats <= 2 else 2.8, 0.7 if seats <= 2 else 1.4, 0.75)
    else:
        w, d, h = dims.fill(1.4, 0.7, 0.75)
    oak = mat("oak")
    top = (h - TOP, h)

    if shape == "l":
        main_d = min(0.75, d * 0.55)
        ret_w = min(0.6, w * 0.4)
        slab(root, oak, (-w / 2, w / 2), (-d / 2, -d / 2 + main_d), top, bevel=0.005)
        slab(root, oak, (w / 2 - ret_w, w / 2), (-d / 2 + main_d, d / 2), top, bevel=0.005)
        loop_leg_y(root, mat("black_metal"), -w / 2 + INSET, (-d / 2 + 0.04, -d / 2 + main_d - 0.04), h - TOP, BAR)
        loop_leg_x(root, mat("black_metal"), d / 2 - INSET, (w / 2 - ret_w + 0.04, w / 2 - 0.04), h - TOP, BAR)
        post(root, mat("black_metal"), w / 2 - BAR / 2 - 0.04, -d / 2 + BAR / 2 + 0.04, (0.0, h - TOP), BAR)
    elif shape == "bench" and seats >= 4:
        gap = 0.012
        slab(root, oak, (-w / 2, w / 2), (-d / 2, -gap), top, bevel=0.005)
        slab(root, oak, (-w / 2, w / 2), (gap, d / 2), top, bevel=0.005)
        slab(root, mat("charcoal"), (-w / 2 + 0.1, w / 2 - 0.1), (-gap, gap), (h - TOP - 0.06, h - TOP))
        _legs_along_x(root, w, (-d / 2 + 0.04, d / 2 - 0.04), h)
    else:
        slab(root, oak, (-w / 2, w / 2), (-d / 2, d / 2), top, bevel=0.005)
        if p.get("standing"):
            _standing_base(root, w, d, h)
        else:
            _legs_along_x(root, w, (-d / 2 + 0.04, d / 2 - 0.04), h)
    return w, d, h
