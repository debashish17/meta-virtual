"""Partitions, walls and screens (Partitions board, Meeting ROOM ENCLOSURES, Workstation DESK DIVIDERS).

One panel builder covers glass (framed / frameless), frosted, solid, wood, fabric and slat
panels; corner (L) and T-junction variants combine two panels. Feet and casters widen the
footprint, which the returned target depth reflects.
"""

from ..materials import mat
from ..parts import slab
from .common import casters

THICKNESS = {"glass": 0.05, "frosted": 0.05, "fabric": 0.05, "solid": 0.10, "wood": 0.05,
             "wood_slats": 0.05, "metal_slats": 0.05}
FRAME = 0.04
FABRICS = {"grey": "felt_grey", "light": "felt_light", "dark": "felt_dark", "sage": "fabric_sage"}


class _Panel:
    """Places slabs for one panel running along X (at y=c) or along Y (at x=c)."""

    def __init__(self, root, along, a, b, c, t):
        self.root, self.along, self.a, self.b, self.c, self.t = root, along, a, b, c, t

    def box(self, material, a, b, z, t=None, bevel=0.0):
        t = self.t if t is None else t
        span, across = (a, b), (self.c - t / 2, self.c + t / 2)
        x, y = (span, across) if self.along == "x" else (across, span)
        return slab(self.root, material, x, y, z, bevel=bevel)


def _build_panel(panel, p, z0, h):
    material, a, b = p.get("material", "glass"), panel.a, panel.b
    black = mat("black_metal")
    if material in ("glass", "frosted"):
        pane = mat("glass" if material == "glass" else "frosted")
        if p.get("frame", "black") == "black":
            for edge in ((a, a + FRAME), (b - FRAME, b)):
                panel.box(black, *edge, (z0, h))
            panel.box(black, a, b, (z0, z0 + FRAME))
            panel.box(black, a, b, (h - FRAME, h))
            panel.box(pane, a + FRAME, b - FRAME, (z0 + FRAME, h - FRAME), t=0.012)
        else:  # frameless: the floor channel sets the depth, the pane sits in it
            panel.box(black, a, b, (z0, z0 + 0.03))
            panel.box(pane, a, b, (z0 + 0.03, h), t=min(0.012, panel.t))
        if p.get("door"):
            door_a, door_b = b - FRAME - 0.95, b - FRAME
            for x in (door_a, door_b - 0.03):
                panel.box(black, x, x + 0.03, (z0, min(h - FRAME, 2.1)))
            panel.box(black, door_a, door_b, (min(h - FRAME, 2.1) - 0.03, min(h - FRAME, 2.1)))
            panel.box(black, door_a + 0.06, door_a + 0.075, (1.0, 1.6), t=panel.t * 0.9)
    elif material == "solid":
        panel.box(mat("off_white"), a, b, (z0 + 0.08, h))
        panel.box(mat("charcoal"), a, b, (z0, z0 + 0.08))
    elif material == "wood":
        panel.box(mat("oak"), a + 0.02, b - 0.02, (z0, h), bevel=0.004)
        for edge in ((a, a + 0.02), (b - 0.02, b)):
            panel.box(black, *edge, (z0, h))
    elif material == "fabric":
        panel.box(mat(FABRICS.get(p.get("fabric", "grey"), "felt_grey")), a, b, (z0, h), bevel=0.015)
    else:  # wood_slats / metal_slats
        slat = mat("oak" if material == "wood_slats" else "black_metal")
        count = max(3, round((b - a) / 0.08))
        step = (b - a) / count
        for i in range(count):
            panel.box(slat, a + i * step + step * 0.25, a + (i + 1) * step - step * 0.25, (z0 + 0.03, h - 0.03), bevel=0.004)
        panel.box(black, a, b, (z0, z0 + 0.03), t=0.03)
        panel.box(black, a, b, (h - 0.03, h), t=0.03)


def build(dims, p, root, rng):
    material = p.get("material", "glass")
    frameless = material in ("glass", "frosted") and p.get("frame", "black") == "none"
    t = 0.03 if frameless else THICKNESS.get(material, 0.05)
    # desk-mounted screens set default_h (~0.45 m); freestanding panels use the material default
    default_h = p.get("default_h") or {"fabric": 1.2, "solid": 2.7}.get(material, 2.4)
    w, d, h = dims.fill(1.2, t, default_h)
    t = min(t, max(d, 0.012)) if not (p.get("feet") or p.get("casters")) else t
    z0 = 0.0
    if p.get("casters"):
        depth = 0.4
        casters(root, w, depth, inset=0.025)
        slab(root, mat("black_metal"), (-w / 2 + 0.05, w / 2 - 0.05), (-0.03, 0.03), (0.05, 0.09))
        z0 = 0.09
    elif p.get("feet"):
        depth = 0.3
        for sx in (-1, 1):
            x = sx * w * 0.35
            slab(root, mat("black_metal"), (x - 0.025, x + 0.025), (-depth / 2, depth / 2), (0.0, 0.03), bevel=0.006)
        z0 = 0.03
    else:
        depth = t

    if p.get("corner"):
        _build_panel(_Panel(root, "x", -w / 2, w / 2, -w / 2 + t / 2, t), p, z0, h)
        _build_panel(_Panel(root, "y", -w / 2 + t, w / 2, -w / 2 + t / 2, t), p, z0, h)
        return w, w, h
    if p.get("junction") == "t":
        _build_panel(_Panel(root, "x", -w / 2, w / 2, 0.0, t), p, z0, h)
        _build_panel(_Panel(root, "y", t / 2, w / 2, 0.0, t), p, z0, h)
        return w, w / 2 + t / 2, h
    _build_panel(_Panel(root, "x", -w / 2, w / 2, 0.0, t), p, z0, h)
    return w, depth, h
