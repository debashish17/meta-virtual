"""Helpers shared by family builders.

A builder is `build(dims, params, root, rng) -> (w, d, h)`: it fills any axis the label did not
print with a real-world default, builds parts that fit those extents exactly, and returns the
target it built to (QA compares the measured GLB against it and against the label).
"""

import random
from dataclasses import dataclass

from ..materials import mat
from ..parts import blob, rod, slab


@dataclass(frozen=True)
class Dims:
    w: float | None = None
    d: float | None = None
    h: float | None = None

    def fill(self, w: float, d: float, h: float) -> tuple[float, float, float]:
        return (self.w or w, self.d or d, self.h or h)


def seeded(key: str) -> random.Random:
    """Deterministic randomness per asset id, so rebuilds are byte-stable. A str seed is hashed
    with SHA-512 (unaffected by PYTHONHASHSEED), so distinct ids get distinct streams."""
    return random.Random(key)


def shell(root, material, x, y, z, t=0.018):
    """Open-fronted carcass (back, sides, top, bottom) so contents behind glass stay visible."""
    slab(root, material, x, (y[1] - t, y[1]), z)
    for side in ((x[0], x[0] + t), (x[1] - t, x[1])):
        slab(root, material, side, y, z)
    slab(root, material, x, y, (z[0], z[0] + t))
    slab(root, material, x, y, (z[1] - t, z[1]))


def post(root, material, x, y, z, size):
    """Square upright tube centred on (x, y)."""
    return slab(root, material, (x - size / 2, x + size / 2), (y - size / 2, y + size / 2), z, bevel=0.003)


def loop_leg_y(root, material, x, y, z_top, bar=0.05):
    """O-shaped desk leg in the YZ plane at x, spanning y=(y0, y1) from the floor to z_top."""
    xs = (x - bar / 2, x + bar / 2)
    slab(root, material, xs, y, (0.0, bar * 0.6), bevel=0.004)
    slab(root, material, xs, y, (z_top - bar * 0.6, z_top), bevel=0.004)
    for yy in (y[0] + bar / 2, y[1] - bar / 2):
        post(root, material, x, yy, (0.0, z_top), bar)


def loop_leg_x(root, material, y, x, z_top, bar=0.05):
    """O-shaped leg in the XZ plane at y, spanning x=(x0, x1)."""
    ys = (y - bar / 2, y + bar / 2)
    slab(root, material, x, ys, (0.0, bar * 0.6), bevel=0.004)
    slab(root, material, x, ys, (z_top - bar * 0.6, z_top), bevel=0.004)
    for xx in (x[0] + bar / 2, x[1] - bar / 2):
        post(root, material, xx, y, (0.0, z_top), bar)


def casters(root, w, d, r=0.025, inset=0.04):
    for sx in (-1, 1):
        for sy in (-1, 1):
            blob(root, mat("charcoal"), (sx * (w / 2 - inset), sy * (d / 2 - inset), r), (r * 0.6, r, r))


def handle_v(root, x, y_front, z):
    """Vertical bar pull standing proud of a front at y_front."""
    rod(root, mat("black_metal"), (x, y_front - 0.012, z[0]), (x, y_front - 0.012, z[1]), 0.007, segments=8)


def handle_h(root, x, y_front, z):
    rod(root, mat("black_metal"), (x[0], y_front - 0.012, z), (x[1], y_front - 0.012, z), 0.007, segments=8)
