"""Chairs and stools (Workstation CHAIRS, Lounge LOUNGE CHAIRS, Meeting MEETING CHAIRS).

Proportions follow the boards: frames are slender (3 cm legs, thin arm rails) and hold thick,
rounded cushions that fill them; backs are tall and reclined; stool legs splay past the seat.
"""

import math

from ..materials import mat
from ..parts import blob, disc, extrude, lathe, rod, slab
from .common import post

UPHOLSTERY = {"leather": "leather", "charcoal": "fabric_dark", "light_fabric": "fabric_cream",
              "grey": "fabric_grey", "sage": "fabric_sage", "rust": "fabric_rust"}

LEG = 0.03     # square frame legs
RAIL = 0.024   # seat rails and arm rails


def _reclined(material, root, x, y_back, z_bottom, thick, top, tilt, bevel):
    """Cushion standing on z_bottom with its back face at y_back, reclined by `tilt` (radians) about
    its bottom-back edge and sized so its highest point is `top` and nothing passes y_back.
    Returns (front_y_at_bottom, a function placing points on its front face)."""
    s, c = math.sin(tilt), math.cos(tilt)
    length = (top - z_bottom - thick * s) / c
    pivot_y = y_back - length * s          # pull forward so the reclined top stays inside y_back
    cy, cz = pivot_y - thick / 2, z_bottom + length / 2
    ry, rz = pivot_y + (cy - pivot_y) * c + (cz - z_bottom) * s, z_bottom - (cy - pivot_y) * s + (cz - z_bottom) * c
    slab(root, material, x, (ry - thick / 2, ry + thick / 2), (rz - length / 2, rz + length / 2),
         bevel=bevel, segments=4, rotate=(-tilt, 0.0, 0.0))

    def on_front(px, along):
        """(x, y, z) on the front face, `along` 0..1 from bottom to top."""
        ly, lz = -thick / 2 - 0.004, (along - 0.5) * length
        return (px, ry + ly * c + lz * s, rz - ly * s + lz * c)

    return pivot_y - thick * c, on_front


def _upholstered(root, w, d, h, frame, cushion, arm_z, seat_z, seat_t, back_t, tilt_deg, tufted=False):
    """Slender four-leg frame with arm rails, thick seat cushion(s) filling it and a reclined back."""
    xi = w / 2 - LEG / 2
    for sx in (-1, 1):
        x, arm_x = sx * xi, sx * (w / 2 - 0.022)   # arm rails sit flush with the legs' outer faces
        post(root, frame, x, -d / 2 + LEG / 2, (0.0, arm_z - RAIL), LEG)
        post(root, frame, x, d / 2 - LEG / 2, (0.0, arm_z - RAIL), LEG)
        slab(root, frame, (arm_x - 0.022, arm_x + 0.022), (-d / 2, d / 2), (arm_z - RAIL, arm_z), bevel=0.008)
        slab(root, frame, (x - RAIL / 2, x + RAIL / 2), (-d / 2 + LEG, d / 2 - LEG), (seat_z - seat_t - RAIL, seat_z - seat_t))
    for y in ((-d / 2, -d / 2 + RAIL), (d / 2 - RAIL, d / 2)):
        slab(root, frame, (-xi, xi), y, (seat_z - seat_t - RAIL, seat_z - seat_t))

    inner = (-w / 2 + LEG + 0.003, w / 2 - LEG - 0.003)
    halves = [inner] if not tufted else [(inner[0], -0.003), (0.003, inner[1])]
    seat_front, on_back = None, []
    for hx in halves:
        front, place = _reclined(cushion, root, hx, d / 2 - LEG - 0.003, seat_z - seat_t * 0.6, back_t, h,
                                 math.radians(tilt_deg), min(0.05, back_t * 0.35))
        seat_front, on_back = front, on_back + [(hx, place)]
    for hx in halves:
        slab(root, cushion, hx, (-d / 2 + 0.004, seat_front + 0.02), (seat_z - seat_t, seat_z),
             bevel=min(0.05, seat_t * 0.38), segments=4)
    if tufted:  # two buttons down each back cushion, as on the board's lounge chairs
        for (x0, x1), place in on_back:
            for along in (0.38, 0.68):
                blob(root, cushion, place((x0 + x1) / 2, along), (0.012, 0.006, 0.012), segments=8, rings=4)


def armchair(dims, p, root, rng):
    """Lounge / accent chair."""
    w, d, h = dims.fill(0.72, 0.76, 0.82)
    frame = mat(p.get("frame", "oak"))
    cushion = mat(UPHOLSTERY.get(p.get("upholstery", "light_fabric"), "fabric_cream"))
    _upholstered(root, w, d, h, frame, cushion, arm_z=0.6, seat_z=0.45, seat_t=0.15, back_t=0.15,
                 tilt_deg=12, tufted=bool(p.get("tufted")))
    return w, d, h


def side_chair(dims, p, root, rng):
    """Visitor / conference chair: the same slender frame, more upright, slimmer cushions."""
    w, d, h = dims.fill(0.56, 0.56, 0.85)
    frame = mat(p.get("frame", "black_metal"))
    cushion = mat(UPHOLSTERY.get(p.get("upholstery", "charcoal"), "fabric_dark"))
    _upholstered(root, w, d, h, frame, cushion, arm_z=0.63, seat_z=0.47, seat_t=0.1, back_t=0.1, tilt_deg=8)
    return w, d, h


def task_chair(dims, p, root, rng):
    """5-star swivel chair: thick contoured seat, tapered reclined back, slim T-arms."""
    high = p.get("back") == "high"
    w, d, h = dims.fill(0.66, 0.66, 1.22 if high else 1.0)
    fabric, steel = mat(p.get("fabric", "charcoal")), mat("black_metal")
    caster, seat_z = 0.025, 0.48
    radius = d / 2 - caster
    for i in range(5):  # the star's front caster touches -d/2
        a = 2 * math.pi * i / 5
        tip = (math.sin(a) * radius, -math.cos(a) * radius)
        rod(root, steel, (0, 0, 0.075), (tip[0], tip[1], 0.05), 0.013, segments=8)
        blob(root, mat("charcoal"), (tip[0], tip[1], caster), (caster * 0.7, caster, caster))
    rod(root, steel, (0, 0, 0.06), (0, 0, seat_z - 0.1), 0.024, segments=14)
    slab(root, steel, (-0.12, 0.12), (-0.12, 0.1), (seat_z - 0.13, seat_z - 0.09), bevel=0.006)

    seat_w = w * 0.78
    slab(root, steel, (-seat_w / 2 + 0.02, seat_w / 2 - 0.02), (-d * 0.34, d * 0.26), (seat_z - 0.1, seat_z - 0.085))
    slab(root, fabric, (-seat_w / 2, seat_w / 2), (-d * 0.38, d * 0.29), (seat_z - 0.09, seat_z), bevel=0.04, segments=4)

    back_top = h - (0.17 if high else 0.0)
    bottom = seat_z + 0.07
    tall = back_top - bottom
    outline = [(-0.17, 0.0), (0.17, 0.0), (0.2, tall * 0.35), (0.23, tall * 0.8), (0.21, tall), (-0.21, tall),
               (-0.23, tall * 0.8), (-0.2, tall * 0.35)]
    tilt = math.radians(10)
    y_back = d / 2 - tall * math.sin(tilt) - 0.005      # reclined top stays inside the star's footprint
    back = [(x, bottom + z) for x, z in outline]
    extrude(root, steel, back, (y_back - 0.035, y_back), bevel=0.012, tilt=-tilt, pivot=(y_back, bottom))
    inset = [(x * 0.9, bottom + 0.03 + z * (tall - 0.06) / tall) for x, z in outline]
    extrude(root, fabric, inset, (y_back - 0.05, y_back - 0.03), bevel=0.008, tilt=-tilt, pivot=(y_back, bottom))
    slab(root, steel, (-0.03, 0.03), (d * 0.18, y_back), (seat_z - 0.12, seat_z - 0.09))      # spine
    slab(root, steel, (-0.03, 0.03), (y_back - 0.04, y_back), (seat_z - 0.12, bottom + 0.06))
    if high:  # headrest on a short stem
        top = back_top + 0.17
        lean = (back_top - bottom) * math.sin(tilt)
        rod(root, steel, (0, y_back + lean - 0.02, back_top - 0.02), (0, y_back + lean - 0.02, top - 0.08), 0.012, segments=8)
        head = [(-0.12, 0.0), (0.12, 0.0), (0.13, 0.05), (0.12, 0.11), (-0.12, 0.11), (-0.13, 0.05)]
        extrude(root, fabric, [(x, top - 0.11 + z) for x, z in head], (y_back + lean - 0.07, y_back + lean - 0.02), bevel=0.012)
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.032)   # arm pads reach the chair's full width, posts clear of the seat
        post(root, steel, x, -0.01, (seat_z - 0.09, seat_z + 0.2), 0.022)
        slab(root, steel, (min(x, sx * seat_w / 2), max(x, sx * seat_w / 2)), (-0.03, 0.01), (seat_z - 0.09, seat_z - 0.07))
        slab(root, mat("charcoal"), (x - 0.032, x + 0.032), (-0.15, 0.09), (seat_z + 0.2, seat_z + 0.225), bevel=0.01)
    return w, d, h


def stool(dims, p, root, rng):
    """Round oak seat on four black legs splayed past it, with a foot ring; the backed bar stool
    has a curved lip at the back of the seat (Kitchenette and Lounge boards)."""
    bar, back = p.get("height") == "bar", bool(p.get("back"))
    seat_z = 0.76 if bar else 0.46
    w, d, h = dims.fill(0.42, 0.42, seat_z + 0.065 if back else seat_z)
    seat_z = min(seat_z, h)
    steel, oak = mat("black_metal"), mat("oak")
    r = min(w, d) / 2 * 0.84
    t = 0.035
    lathe(root, oak, [(0.0, seat_z - t), (r * 0.94, seat_z - t), (r, seat_z - t + 0.01), (r, seat_z - 0.006),
                      (r * 0.95, seat_z), (r * 0.3, seat_z - 0.006), (0.0, seat_z - 0.006)], segments=28)
    if back:
        lathe(root, oak, [(r - 0.022, seat_z - 0.01), (r, seat_z - 0.01), (r, h - 0.008), (r - 0.01, h),
                          (r - 0.022, h - 0.008), (r - 0.022, seat_z - 0.01)],
              segments=14, turn=math.radians(10), sweep=math.radians(160))
    top, foot = r * 0.42, min(w, d) / 2 - 0.012
    under = seat_z - t
    for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
        rod(root, steel, (sx * top, sy * top, under), (sx * foot, sy * foot, 0.0), 0.012, segments=8)
    ring_z = seat_z * 0.45   # high enough that the round ring stays inside the splayed feet
    k = top + (foot - top) * (1 - ring_z / under)
    ring = [(k * math.sqrt(2) * math.cos(a), k * math.sqrt(2) * math.sin(a))
            for a in (math.pi / 4 + 2 * math.pi * i / 16 for i in range(16))]
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        rod(root, steel, (x0, y0, ring_z), (x1, y1, ring_z), 0.008, segments=6)
    return w, d, h
