"""Bins and appliance boxes (Print board WASTE & RECYCLING, PRINTER & COPIER, IT & SERVER;
Kitchenette REFRIGERATION and WASTE & CLEANING)."""

from ..materials import mat
from ..parts import disc, loft, rod, rounded_rect, slab
from .common import handle_v, shell

DARK_BODIES = ("charcoal", "black_metal", "stone_black", "grey_mid")


def _bin_body(root, x, y, h, body, lid):
    slab(root, mat(body), x, y, (0.0, h - 0.03), bevel=0.012)
    slab(root, mat(lid), x, y, (h - 0.03, h), bevel=0.008)
    slab(root, mat("charcoal"), (x[0] + 0.04, x[1] - 0.04), (y[0] + 0.04, y[1] - 0.04), (h - 0.002, h + 0.0))


def _open_bin(root, w, d, h, body):
    """Open-topped bin on small feet, narrower at the base, with a rolled lip round the rim and a
    darker hollow inside (Workstation and Kitchenette boards, TRASH & RECYCLE)."""
    wall, lip, taper, corner, feet = 0.01, 0.006, 0.025, 0.03, 0.012
    top = (w / 2 - lip, d / 2 - lip)                   # outer wall just under the lip
    base = (top[0] - taper, top[1] - taper)
    ring = lambda hx, hy: rounded_rect(hx, hy, corner)  # noqa: E731
    loft(root, mat(body), [
        (feet, ring(*base)),
        (h - 0.03, ring(*top)),
        (h - 0.03, ring(top[0] + lip, top[1] + lip)),
        (h, ring(top[0] + lip, top[1] + lip)),
        (h, ring(top[0] - wall, top[1] - wall)),        # rim
    ], cap_first=True)
    inside = mat("stone_black" if body in DARK_BODIES else "grey_light")
    loft(root, inside, [
        (feet + 0.03, ring(base[0] - wall, base[1] - wall)),
        (h, ring(top[0] - wall, top[1] - wall)),
    ], cap_first=True)
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (base[0] - 0.035), sy * (base[1] - 0.035)
            slab(root, mat("charcoal"), (x - 0.02, x + 0.02), (y - 0.02, y + 0.02), (0.0, feet + 0.002))


def bin_(dims, p, root, rng):
    count = int(p.get("count", 1))
    w, d, h = dims.fill(0.35 * count, 0.35, 0.6)
    body = p.get("colour", "charcoal")
    if count == 1 and p.get("open"):
        _open_bin(root, w, d, h, body)
        return w, d, h
    if count == 1:
        _bin_body(root, (-w / 2, w / 2), (-d / 2, d / 2), h, body, p.get("lid", body))
        if p.get("slot"):
            slab(root, mat("black_metal"), (-w * 0.3, w * 0.3), (-0.012, 0.012), (h - 0.001, h))
        return w, d, h
    each = (w - 0.02 * (count - 1)) / count
    lids = p.get("lids", ["yellow", "green", "blue"])
    for i in range(count):
        x0 = -w / 2 + i * (each + 0.02)
        _bin_body(root, (x0, x0 + each), (-d / 2, d / 2), h, body, lids[i % len(lids)])
    return w, d, h


def _pull(root, a, b, door_face, front):
    """Bar pull from point a to b (x, z) held off the door by two stand-offs."""
    steel, y = mat("grey_metal"), front + 0.008
    rod(root, steel, (a[0], y, a[1]), (b[0], y, b[1]), 0.008, segments=10)
    for t in (0.12, 0.88):
        x, z = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        rod(root, steel, (x, y, z), (x, door_face + 0.004, z), 0.006, segments=8)


def _solid_fridge(root, w, d, h, p):
    """Cabinet on feet behind proud, bevelled doors with a dark reveal round each one, hinge
    knuckles on the outer edges and bar pulls; under-counter units have a vented control strip
    above the door (Kitchenette board, REFRIGERATION)."""
    body, seam, steel = mat(p.get("colour", "stainless")), mat("stone_black"), mat("grey_metal")
    feet = 0.025
    front = -d / 2 + 0.01            # pulls reach this far forward
    door_face = front + 0.03
    carcass = door_face + 0.025      # 25 mm doors
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (w / 2 - 0.05), sy * (d / 2 - 0.08)
            slab(root, mat("charcoal"), (x - 0.025, x + 0.025), (y - 0.025, y + 0.025), (0.0, feet + 0.002))
    slab(root, body, (-w / 2, w / 2), (carcass, d / 2), (feet, h), bevel=0.015, segments=3)
    small = h < 1.2
    top = h - 0.012
    if small:
        strip = (h - 0.085, h - 0.012)
        slab(root, steel, (-w / 2 + 0.006, w / 2 - 0.006), (door_face + 0.004, carcass), strip, bevel=0.006)
        for k in range(3):
            z = strip[0] + 0.018 + k * 0.016
            slab(root, seam, (-w / 2 + 0.05, w / 2 - 0.18), (door_face + 0.002, door_face + 0.006), (z, z + 0.006))
        top = strip[0] - 0.006
    slab(root, seam, (-w / 2 + 0.004, w / 2 - 0.004), (carcass - 0.004, carcass + 0.002), (feet + 0.006, top + 0.004))
    doors = int(p.get("doors", 1))
    gap = 0.008
    span = (w - 0.008 - gap * (doors - 1)) / doors
    for i in range(doors):
        x0 = -w / 2 + 0.004 + i * (span + gap)
        x = (x0, x0 + span)
        z = (feet + 0.012, top)
        slab(root, body, x, (door_face, carcass - 0.004), z, bevel=0.009, segments=3)
        hinge_left = i == 0          # side-by-side doors hinge on the outside; single doors on the left
        hx = x[0] + 0.01 if hinge_left else x[1] - 0.01
        for hz in (z[0] + 0.04, z[1] - 0.04):
            disc(root, steel, hx, door_face - 0.002, (hz - 0.022, hz + 0.022), 0.009, segments=10)
        if small:                     # horizontal pull under the control strip
            _pull(root, (x[0] + 0.12, z[1] - 0.06), (x[1] - 0.12, z[1] - 0.06), door_face, front)
        else:                         # long vertical pull beside the split
            px = x[1] - 0.06 if hinge_left else x[0] + 0.06
            _pull(root, (px, h * 0.38), (px, h * 0.8), door_face, front)


def _glass_fridge(root, w, d, h, p):
    """Hollow body with lit shelves of bottles behind framed glass doors (drinks fridge, wine cooler)."""
    body = mat(p.get("colour", "stainless"))
    front = -d / 2 + 0.03
    shell(root, body, (-w / 2, w / 2), (front, d / 2), (0.0, h), t=0.03)
    cavity = (-w / 2 + 0.05, w / 2 - 0.05)
    slab(root, mat("led_panel"), cavity, (d / 2 - 0.04, d / 2 - 0.03), (0.04, h - 0.04))  # lit back wall
    rows = max(1, round((h - 0.2) / 0.3))
    bottle_y = front + 0.06  # stocked up to the glass; from 35° above, deeper rows hide under shelves
    for k in range(rows):
        z = 0.08 + k * (h - 0.16) / rows
        slab(root, mat("grey_metal"), cavity, (front + 0.01, d / 2 - 0.03), (z - 0.008, z))
        count = max(2, round((cavity[1] - cavity[0]) / 0.09))
        for j in range(count):
            bx = cavity[0] + (j + 0.5) * (cavity[1] - cavity[0]) / count
            disc(root, mat(("blue", "green", "red")[(j + k) % 3]), bx, bottle_y,
                 (z, z + min(0.18, (h - 0.16) / rows - 0.04)), 0.025, segments=8)
    doors = int(p.get("doors", 1))
    span = w / doors
    for i in range(doors):
        x = (-w / 2 + i * span + 0.004, -w / 2 + (i + 1) * span - 0.004)
        bar, door_y, door_z = 0.04, (front - 0.02, front), (0.02, h - 0.01)
        for side in ((x[0], x[0] + bar), (x[1] - bar, x[1])):
            slab(root, mat("black_metal"), side, door_y, door_z)
        for edge in ((door_z[0], door_z[0] + 0.08), (door_z[1] - bar, door_z[1])):
            slab(root, mat("black_metal"), x, door_y, edge)
        slab(root, mat("glass"), (x[0] + bar, x[1] - bar), (front - 0.014, front - 0.006),
             (door_z[0] + 0.08, door_z[1] - bar))
        handle_v(root, x[1] - 0.05 if i == 0 else x[0] + 0.05, front, (h * 0.45, h * 0.75))


def _shredder(root, w, d, h, p):
    """Bin body under a slightly wider cutting head with a feed slot on top, a pull on the bin's
    front and a power switch (Print board, MISCELLANEOUS UTILITIES)."""
    body, seam = mat(p.get("colour", "charcoal")), mat("stone_black")
    feet, head = 0.015, 0.11
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (w / 2 - 0.05), sy * (d / 2 - 0.05)
            slab(root, seam, (x - 0.02, x + 0.02), (y - 0.02, y + 0.02), (0.0, feet + 0.002))
    slab(root, body, (-w / 2 + 0.012, w / 2 - 0.012), (-d / 2 + 0.012, d / 2 - 0.012), (feet, h - head),
         bevel=0.02, segments=3)
    slab(root, seam, (-w / 2 + 0.016, w / 2 - 0.016), (-d / 2 + 0.016, d / 2 - 0.016), (h - head - 0.008, h - head + 0.004))
    slab(root, body, (-w / 2, w / 2), (-d / 2, d / 2), (h - head + 0.004, h), bevel=0.02, segments=3)
    slab(root, seam, (-w * 0.32, w * 0.32), (-0.012, 0.012), (h - 0.004, h + 0.001))          # feed slot
    slab(root, seam, (-w / 2 + 0.03, w / 2 - 0.03), (-d / 2 - 0.002, -d / 2 + 0.004), (h - 0.06, h - 0.052))  # head seam
    slab(root, mat("grey_metal"), (-0.07, 0.07), (-d / 2 + 0.006, -d / 2 + 0.014), (h - head - 0.07, h - head - 0.045),
         bevel=0.004)                                                                              # bin pull
    disc(root, mat("green"), w / 2 - 0.06, -d / 2 + 0.06, (h, h + 0.004), 0.012, segments=12)  # power switch


def _fridge(root, w, d, h, p):
    (_glass_fridge if p.get("glass") else _solid_fridge)(root, w, d, h, p)


def appliance(dims, p, root, rng):
    kind = p.get("kind", "box")
    defaults = {"fridge": (0.7, 0.7, 1.8), "microwave": (0.5, 0.4, 0.3), "printer": (0.6, 0.6, 0.8),
                "rack": (0.6, 0.8, 2.0), "shredder": (0.4, 0.3, 0.6), "box": (0.3, 0.3, 0.6)}
    if kind == "fridge" and p.get("size") == "small":  # under-counter units on the Kitchenette board
        defaults["fridge"] = (0.6, 0.6, 0.85)
    w, d, h = dims.fill(*defaults.get(kind, defaults["box"]))
    if kind == "fridge":
        _fridge(root, w, d, h, p)
    elif kind == "microwave":
        slab(root, mat(p.get("colour", "stainless")), (-w / 2, w / 2), (-d / 2, d / 2), (0.0, h), bevel=0.01)
        slab(root, mat("screen"), (-w / 2 + 0.04, w / 2 - 0.14), (-d / 2 - 0.002, -d / 2 + 0.004), (0.05, h - 0.05))
        slab(root, mat("charcoal"), (w / 2 - 0.12, w / 2 - 0.03), (-d / 2 - 0.002, -d / 2 + 0.004), (0.05, h - 0.05))
    elif kind == "printer":
        white, dark = mat("off_white"), mat("charcoal")
        slab(root, white, (-w / 2, w / 2), (-d / 2, d / 2), (0.0, h * 0.82), bevel=0.012)
        trays = 2 if h > 0.6 else 1
        for i in range(trays):
            z = 0.08 + i * h * 0.18
            slab(root, dark, (-w / 2 + 0.04, w / 2 - 0.04), (-d / 2 - 0.002, -d / 2 + 0.003), (z, z + 0.008))
            slab(root, dark, (-0.08, 0.08), (-d / 2 - 0.002, -d / 2 + 0.003), (z + 0.04, z + 0.06))
        slab(root, dark, (-w / 2 + 0.02, w / 2 - 0.02), (-d / 2 + 0.02, d / 2 - 0.02), (h * 0.82, h * 0.86))
        slab(root, white, (-w / 2 + 0.02, w / 2 - 0.02), (-d / 2 + 0.06, d / 2 - 0.02), (h * 0.86, h), bevel=0.01)
        slab(root, mat("screen"), (w / 2 - 0.2, w / 2 - 0.04), (-d / 2, -d / 2 + 0.06), (h * 0.84, h * 0.88))
    elif kind == "shredder":
        _shredder(root, w, d, h, p)
    elif kind == "rack":
        slab(root, mat("black_metal"), (-w / 2, w / 2), (-d / 2 + 0.02, d / 2), (0.03, h), bevel=0.006)
        slab(root, mat("grey_mid"), (-w / 2 + 0.04, w / 2 - 0.04), (-d / 2, -d / 2 + 0.02), (0.08, h - 0.06))
        for k in range(int((h - 0.2) / 0.12)):
            z = 0.15 + k * 0.12
            slab(root, mat(("blue", "green")[k % 2]), (-w / 2 + 0.08, -w / 2 + 0.12), (-d / 2 - 0.002, -d / 2), (z, z + 0.012))
        for sx in (-1, 1):
            for sy in (-1, 1):
                slab(root, mat("charcoal"), (sx * (w / 2 - 0.04) - 0.02, sx * (w / 2 - 0.04) + 0.02),
                     (sy * (d / 2 - 0.04) - 0.02, sy * (d / 2 - 0.04) + 0.02), (0.0, 0.03))
    else:
        body = mat(p.get("colour", "off_white"))
        slab(root, body, (-w / 2, w / 2), (-d / 2, d / 2), (0.0, h), bevel=0.015)
        for k in range(6):
            z = h * 0.25 + k * h * 0.06
            slab(root, mat("charcoal"), (-w / 2 + 0.05, w / 2 - 0.05), (-d / 2 - 0.002, -d / 2 + 0.002), (z, z + 0.008))
    return w, d, h
