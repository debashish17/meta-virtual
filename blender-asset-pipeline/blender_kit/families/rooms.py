"""Booths and lamps (Lounge PHONE BOOTHS & FOCUS PODS, Meeting PHONE BOOTH, LIGHTING items)."""

from ..materials import mat
from ..parts import disc, rod, slab
from .chairs import UPHOLSTERY
from .common import post


def booth(dims, p, root, rng):
    kind = p.get("kind", "single")
    if kind == "chair":
        w, d, h = dims.fill(1.0, 0.9, 1.4)
        shell = mat(UPHOLSTERY.get(p.get("upholstery", "grey"), "fabric_grey"))
        slab(root, mat("charcoal"), (-w / 2 + 0.05, w / 2 - 0.05), (-d / 2 + 0.05, d / 2 - 0.05), (0.0, 0.1))
        slab(root, shell, (-w / 2, w / 2), (d / 2 - 0.14, d / 2), (0.1, h), bevel=0.05, segments=3)
        for sx in (-1, 1):
            x = (-w / 2, -w / 2 + 0.12) if sx < 0 else (w / 2 - 0.12, w / 2)
            slab(root, shell, x, (-d / 2 + 0.15, d / 2), (0.1, h * 0.85), bevel=0.04, segments=3)
        slab(root, shell, (-w / 2 + 0.12, w / 2 - 0.12), (-d / 2, d / 2 - 0.14), (0.1, 0.44), bevel=0.04, segments=3)
        return w, d, h
    double = kind == "double"
    w, d, h = dims.fill(2.0 if double else 1.0, 1.2 if double else 1.0, 2.2)
    black, felt = mat("black_metal"), mat("felt_grey")
    slab(root, mat("charcoal"), (-w / 2, w / 2), (-d / 2, d / 2), (0.0, 0.06))
    slab(root, mat("charcoal"), (-w / 2, w / 2), (-d / 2, d / 2), (h - 0.08, h), bevel=0.01)
    for sx in (-1, 1):
        for sy in (-1, 1):
            post(root, black, sx * (w / 2 - 0.025), sy * (d / 2 - 0.025), (0.06, h - 0.08), 0.05)
        x = sx * (w / 2 - 0.025)
        slab(root, felt, (x - 0.025, x + 0.025), (-d / 2 + 0.05, d / 2 - 0.05), (0.06, h - 0.08))
    slab(root, felt, (-w / 2 + 0.05, w / 2 - 0.05), (d / 2 - 0.05, d / 2), (0.06, h - 0.08))
    panes = 2 if double else 1
    span = (w - 0.1) / panes
    for i in range(panes):
        x = (-w / 2 + 0.05 + i * span, -w / 2 + 0.05 + (i + 1) * span)
        slab(root, black, (x[1] - 0.03, x[1]), (-d / 2, -d / 2 + 0.04), (0.06, h - 0.08))
        slab(root, mat("glass"), (x[0], x[1] - 0.03), (-d / 2 + 0.014, -d / 2 + 0.026), (0.06, h - 0.08))
        rod(root, black, (x[1] - 0.08, -d / 2 + 0.008, 0.9), (x[1] - 0.08, -d / 2 + 0.008, 1.3), 0.008, segments=8)
    slab(root, mat("oak"), (-w / 2 + 0.05, w / 2 - 0.05), (d / 2 - 0.4, d / 2 - 0.05), (0.72, 0.75), bevel=0.004)
    return w, d, h


def lamp(dims, p, root, rng):
    kind = p.get("kind", "floor")
    black = mat("black_metal")
    if kind == "desk":
        w, d, h = dims.fill(0.18, 0.3, 0.45)
        base_r = min(w / 2, 0.08)
        shade_r = w / 2
        head_y = -d / 2 + shade_r  # shade rim stays inside the footprint
        disc(root, black, 0, d / 2 - base_r, (0.0, 0.02), base_r, segments=20)
        rod(root, black, (0, d / 2 - base_r, 0.02), (0, 0.0, h * 0.8), 0.008, segments=8)
        rod(root, black, (0, 0.0, h * 0.8), (0, head_y, h - 0.03), 0.008, segments=8)
        disc(root, black, 0, head_y, (h - 0.13, h), shade_r, segments=16, r_top=shade_r * 0.35)
        return w, d, h
    w, d, h = dims.fill(0.35, 0.35, 1.6 if kind == "floor" else 1.5)
    r = min(w, d) / 2
    if kind == "floor":
        disc(root, black, 0, 0, (0.0, 0.025), r * 0.75, segments=24)
        disc(root, black, 0, 0, (0.025, h - 0.28), 0.012, segments=10)
        disc(root, black, 0, 0, (h - 0.3, h), r, segments=24, r_top=r * 0.45)
        disc(root, mat("warm_white"), 0, 0, (h - 0.3, h - 0.29), r * 0.95, segments=24)
    else:  # presentation spotlight on a stand: base and head both span the footprint
        disc(root, black, 0, 0, (0.0, 0.025), r, segments=24)
        disc(root, black, 0, 0, (0.025, h - 0.12), 0.015, segments=10)
        rod(root, black, (0, r * 0.4, h - 0.06), (0, -r + 0.05, h - 0.06), 0.05, segments=16, r_end=0.06)
    return w, d, h
