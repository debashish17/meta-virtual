"""Upholstered pieces and rugs (Lounge board SOFAS, MOVABLE SEATING, RUGS & FLOOR ACCENTS)."""

from ..materials import mat
from ..parts import disc, slab
from .chairs import UPHOLSTERY

ARM = 0.16
LEG = 0.08
SEAT = 0.44


def _cushion_row(root, material, x, y, z, count, bevel=0.04):
    step = (x[1] - x[0]) / count
    for i in range(count):
        slab(root, material, (x[0] + i * step + 0.006, x[0] + (i + 1) * step - 0.006), y, z, bevel=bevel, segments=3)


def _legs(root, x, y, material):
    """Four short legs under the body spanning x=(x0, x1), y=(y0, y1)."""
    for xx in (x[0] + 0.06, x[1] - 0.06):
        for yy in (y[0] + 0.06, y[1] - 0.06):
            slab(root, material, (xx - 0.025, xx + 0.025), (yy - 0.025, yy + 0.025), (0.0, LEG))


def sofa(dims, p, root, rng):
    style, seats = p.get("style", "standard"), int(p.get("seats", 2))
    defaults = {"l": (2.4, 1.6, 0.8), "corner": (1.0, 1.0, 0.8), "high_back": (1.6, 0.9, 1.15)}
    w, d, h = dims.fill(*defaults.get(style, (1.6 if seats <= 2 else 2.2, 0.88, 0.8)))
    cover = mat(UPHOLSTERY.get(p.get("upholstery", "grey"), "fabric_grey"))
    legs = mat("oak" if p.get("legs", "oak") == "oak" else "black_metal")
    back_d = 0.2

    if style == "bench":
        slab(root, mat("oak"), (-w / 2, w / 2), (-d / 2, d / 2), (0.0, 0.3), bevel=0.01)
        _cushion_row(root, cover, (-w / 2 + 0.02, w / 2 - 0.02), (-d / 2 + 0.03, d / 2 - 0.02), (0.3, 0.42), 1)
        slab(root, cover, (-w / 2 + 0.02, w / 2 - 0.02), (d / 2 - 0.16, d / 2), (0.42, h), bevel=0.05, segments=3)
        return w, d, h

    if style == "l":
        chaise_w = min(0.85, w * 0.38)
        main_d = min(0.9, d * 0.6)
        cx = (w / 2 - chaise_w, w / 2) if p.get("hand", "right") == "right" else (-w / 2, -w / 2 + chaise_w)
        arm_x = (-w / 2, -w / 2 + ARM) if p.get("hand", "right") == "right" else (w / 2 - ARM, w / 2)
        main_y = (d / 2 - main_d, d / 2)
        _legs(root, (-w / 2, w / 2), main_y, legs)
        _legs(root, cx, (-d / 2, main_y[0] + 0.12), legs)
        slab(root, cover, (-w / 2, w / 2), main_y, (LEG, 0.28), bevel=0.02)
        slab(root, cover, cx, (-d / 2, main_y[0] + 0.05), (LEG, 0.28), bevel=0.02)
        inner = (arm_x[1] if arm_x[0] < 0 else -w / 2, w / 2 if arm_x[0] < 0 else arm_x[0])
        _cushion_row(root, cover, inner, (main_y[0] + 0.02, d / 2 - back_d), (0.28, SEAT), max(2, seats - 1))
        _cushion_row(root, cover, cx, (-d / 2 + 0.02, main_y[0] + 0.02), (0.28, SEAT), 1)
        slab(root, cover, (-w / 2, w / 2), (d / 2 - back_d, d / 2), (0.28, h), bevel=0.05, segments=3)
        slab(root, cover, arm_x, main_y, (LEG, 0.62), bevel=0.05, segments=3)
        return w, d, h

    _legs(root, (-w / 2, w / 2), (-d / 2, d / 2), legs)
    slab(root, cover, (-w / 2, w / 2), (-d / 2, d / 2), (LEG, 0.28), bevel=0.02)
    if style == "corner":
        _cushion_row(root, cover, (-w / 2 + back_d, w / 2), (-d / 2 + 0.02, d / 2 - back_d), (0.28, SEAT), 1)
        slab(root, cover, (-w / 2, w / 2), (d / 2 - back_d, d / 2), (0.28, h), bevel=0.05, segments=3)
        slab(root, cover, (-w / 2, -w / 2 + back_d), (-d / 2, d / 2), (0.28, h), bevel=0.05, segments=3)
        return w, d, h

    arm = ARM if style != "high_back" else ARM * 1.15
    _cushion_row(root, cover, (-w / 2 + arm, w / 2 - arm), (-d / 2 + 0.02, d / 2 - back_d), (0.28, SEAT), seats)
    slab(root, cover, (-w / 2, w / 2), (d / 2 - back_d, d / 2), (0.28, h), bevel=0.05, segments=3)
    _cushion_row(root, cover, (-w / 2 + arm, w / 2 - arm), (d / 2 - back_d - 0.1, d / 2 - back_d + 0.02),
                 (SEAT, min(h - 0.04, SEAT + 0.36)), seats, bevel=0.05)
    arm_top = 0.62 if style != "high_back" else min(h, 0.9)
    for sx in (-1, 1):
        x = (-w / 2, -w / 2 + arm) if sx < 0 else (w / 2 - arm, w / 2)
        slab(root, cover, x, (-d / 2, d / 2), (LEG, arm_top), bevel=0.05, segments=3)
    return w, d, h


def pouf(dims, p, root, rng):
    w, d, h = dims.fill(0.45, 0.45, 0.42)
    cover = mat(UPHOLSTERY.get(p.get("upholstery", "sage"), "fabric_sage"))
    if p.get("shape") == "round":
        r = min(w, d) / 2
        disc(root, cover, 0, 0, (0.0, h - 0.03), r, segments=32)
        disc(root, cover, 0, 0, (h - 0.03, h), r * 0.97, segments=32)
    else:
        slab(root, cover, (-w / 2, w / 2), (-d / 2, d / 2), (0.0, h), bevel=0.06, segments=4)
    return w, d, h


RUG_COLOURS = {"neutral": "rug_neutral", "dark": "rug_dark", "pattern": "rug_pattern"}


def rug(dims, p, root, rng):
    w, d, h = dims.fill(2.0, 3.0, 0.012)
    tone = p.get("tone", "neutral")
    slab(root, mat(RUG_COLOURS.get(tone, "rug_neutral")), (-w / 2, w / 2), (-d / 2, d / 2), (0.0, h * 0.8), bevel=0.004)
    if tone == "pattern":
        stripes = 9
        for i in range(stripes):
            x0 = -w / 2 + (i + 0.3) * w / stripes
            slab(root, mat("rug_dark"), (x0, x0 + w / stripes * 0.35), (-d / 2 + 0.04, d / 2 - 0.04), (h * 0.8, h))
    else:
        slab(root, mat(RUG_COLOURS.get(tone, "rug_neutral")), (-w / 2 + 0.01, w / 2 - 0.01),
             (-d / 2 + 0.01, d / 2 - 0.01), (h * 0.8, h))
    return w, d, h
