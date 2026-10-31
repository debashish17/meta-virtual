"""Screens and boards (Presentation board DISPLAYS & SCREENS, WHITEBOARDS & BOARDS; Workstation
MONITORS). Printed sizes are the panel (w x h); stands and feet add height on top of that."""

from ..materials import mat
from ..parts import rod, slab
from .common import casters

NOTE_COLOURS = ("note_yellow", "note_pink", "note_blue")


def _panel(root, x, y, z):
    slab(root, mat("black_metal"), x, y, z, bevel=0.004)
    slab(root, mat("screen"), (x[0] + 0.012, x[1] - 0.012), (y[0] - 0.001, y[0]), (z[0] + 0.012, z[1] - 0.012))


def screen(dims, p, root, rng):
    count = int(p.get("count", 1))
    if p.get("kind", "monitor") == "tv":
        w, d, h = dims.fill(1.2, 0.2, 0.7)
        feet = 0.06
        _panel(root, (-w / 2, w / 2), (-0.03, 0.03), (feet, feet + h))
        for sx in (-1, 1):
            x = sx * w * 0.38
            slab(root, mat("black_metal"), (x - 0.02, x + 0.02), (-d / 2, d / 2), (0.0, feet + 0.04), bevel=0.004)
        return w, d, h + feet
    w = dims.w or (0.6 if count == 1 else 0.56 * count + 0.02 * (count - 1))
    each = (w - 0.02 * (count - 1)) / count
    _, d, h = dims.fill(w, 0.22, 0.35)
    stand = 0.12
    panel_y = (-d / 2, -d / 2 + 0.03) if p.get("arm") else (-0.03, 0.0)
    for i in range(count):
        x0 = -w / 2 + i * (each + 0.02)
        _panel(root, (x0, x0 + each), panel_y, (stand, stand + h))
    if p.get("arm"):  # desk clamp at the back, arm reaching forward to the panels
        rod(root, mat("black_metal"), (0, d / 2 - 0.03, 0.0), (0, d / 2 - 0.03, stand + h * 0.5), 0.016, segments=10)
        slab(root, mat("black_metal"), (-w * 0.3, w * 0.3), (panel_y[1], d / 2 - 0.02), (stand + h * 0.45, stand + h * 0.5))
        slab(root, mat("black_metal"), (-0.04, 0.04), (d / 2 - 0.08, d / 2), (0.0, 0.04))
    else:
        slab(root, mat("black_metal"), (-min(0.14, w * 0.3), min(0.14, w * 0.3)), (-d / 2, d / 2), (0.0, 0.012), bevel=0.004)
        slab(root, mat("black_metal"), (-0.025, 0.025), (0.0, 0.03), (0.012, stand + h * 0.4))
    return w, d, h + stand


def stand(dims, p, root, rng):
    """Mobile screen stand (Presentation board, PROJECTORS & AV EQUIPMENT): castored H base, twin
    uprights to the printed height, a shelf for AV kit and mounting rails that sit behind the
    screen. Layouts hang the TV on it; the rails stay just behind a centred panel."""
    w, d, h = dims.fill(0.8, 0.6, 1.8)
    steel = mat("black_metal")
    wheel = 0.06
    for sx in (-1, 1):                    # feet running front to back, joined at the back
        x = sx * (w / 2 - 0.035)
        slab(root, steel, (x - 0.03, x + 0.03), (-d / 2 + 0.03, d / 2 - 0.03), (wheel, wheel + 0.04), bevel=0.006)
    slab(root, steel, (-w / 2 + 0.06, w / 2 - 0.06), (0.05, 0.11), (wheel, wheel + 0.035), bevel=0.004)
    casters(root, w, d, r=wheel / 2, inset=0.035)
    for sx in (-1, 1):
        x = sx * 0.2
        slab(root, steel, (x - 0.025, x + 0.025), (0.055, 0.105), (wheel + 0.035, h - 0.01), bevel=0.003)
        slab(root, steel, (x - 0.03, x + 0.03), (0.05, 0.11), (h - 0.012, h), bevel=0.003)   # end caps
    slab(root, steel, (-0.3, 0.3), (-0.2, 0.12), (0.6, 0.62), bevel=0.004)                   # AV shelf
    for z in (1.05, 1.45):                # mounting rails across the uprights, behind the panel
        slab(root, steel, (-0.32, 0.32), (0.035, 0.055), (z, z + 0.04), bevel=0.003)
    return w, d, h


def board(dims, p, root, rng):
    surface = p.get("surface", "white")
    stand = bool(p.get("stand"))
    w, d, h = dims.fill(1.2, 0.5 if stand else 0.03, 0.9)
    z0 = 0.8 if stand else 0.0
    t = 0.03
    frame = mat("oak" if surface == "cork" else "grey_metal")
    slab(root, frame, (-w / 2, w / 2), (-t / 2, t / 2), (z0, z0 + h), bevel=0.004)
    face = {"white": "warm_white", "glass": "glass", "cork": "cork", "grid": "off_white"}.get(surface, "warm_white")
    slab(root, mat(face), (-w / 2 + 0.02, w / 2 - 0.02), (-t / 2 - 0.002, -t / 2 + 0.004), (z0 + 0.02, z0 + h - 0.02))
    if surface == "grid":
        for k in range(1, int(w / 0.1)):
            x = -w / 2 + k * 0.1
            slab(root, mat("black_metal"), (x - 0.003, x + 0.003), (-t / 2 - 0.006, -t / 2 - 0.002), (z0 + 0.02, z0 + h - 0.02))
    proud = 0.006  # face and notes stand slightly in front of the frame
    if surface in ("white", "cork"):
        for _ in range(rng.randint(5, 10)):
            x, z = rng.uniform(-w / 2 + 0.1, w / 2 - 0.15), rng.uniform(z0 + 0.15, z0 + h - 0.15)
            slab(root, mat(rng.choice(NOTE_COLOURS)), (x, x + 0.07), (-t / 2 - 0.004, -t / 2 - 0.002), (z, z + 0.07))
    if surface == "white":
        proud = 0.04
        slab(root, mat("grey_metal"), (-w * 0.3, w * 0.3), (-t / 2 - proud, -t / 2), (z0 + 0.01, z0 + 0.03))
    if stand:
        for sx in (-1, 1):
            x = sx * (w / 2 - 0.015)
            slab(root, mat("grey_metal"), (x - 0.015, x + 0.015), (-0.015, 0.015), (0.06, z0 + h))
            slab(root, mat("grey_metal"), (x - 0.015, x + 0.015), (-d / 2 + 0.03, d / 2 - 0.03), (0.04, 0.07))
        casters(root, w - 0.03, d, inset=0.03)
        return w, d, z0 + h
    return w, t + proud, h
