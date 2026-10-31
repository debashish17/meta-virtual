"""Geometry primitives, placed by extents in metres.

Conventions for every asset: X = width, Y = depth with the front facing -Y (glTF +Z after
export), Z = up from the floor at 0. Builders place parts by extents (x=(x0, x1), ...) so a
part's size follows the item's dimensions directly; export.finalize fixes the origin afterwards.
"""

import itertools
import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

# Parts are named in creation order ("p0000", "p0001", ...) so export.join visits them in the
# same order every run; Blender's own ".001" suffixes depend on what the session built before.
_counter = itertools.count()


def new_root(name: str) -> bpy.types.Object:
    global _counter
    _counter = itertools.count()
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    return root


def _link(name: str, bm: bmesh.types.BMesh, material, root, smooth: bool) -> bpy.types.Object:
    if smooth:
        for face in bm.faces:
            face.smooth = True
    name = f"p{next(_counter):04d}"
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj.parent = root
    return obj


def slab(root, material, x, y, z, bevel=0.0, segments=2, rotate=None, name="slab"):
    """Box spanning x=(x0, x1), y=(y0, y1), z=(z0, z1); optional Euler rotation about its centre."""
    sx, sy, sz = x[1] - x[0], y[1] - y[0], z[1] - z[0]
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    b = min(bevel, 0.45 * min(sx, sy, sz))
    if b > 0.0005:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=b, segments=segments, profile=0.5, affect="EDGES")
    centre = Vector(((x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2))
    transform = Matrix.Translation(centre)
    if rotate:
        transform = transform @ Euler(rotate).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=transform, verts=bm.verts)
    return _link(name, bm, material, root, smooth=b > 0.0005)


def rod(root, material, a, b, r, segments=12, r_end=None, name="rod"):
    """Cylinder (or cone when r_end is set) from point a to point b."""
    a, b = Vector(a), Vector(b)
    axis = b - a
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=r, radius2=r if r_end is None else r_end, depth=axis.length)
    rotation = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2) @ rotation, verts=bm.verts)
    return _link(name, bm, material, root, smooth=True)


def disc(root, material, cx, cy, z, r, segments=24, r_top=None, name="disc"):
    """Upright cylinder (or tapered cone) centred on (cx, cy) spanning z=(z0, z1)."""
    return rod(root, material, (cx, cy, z[0]), (cx, cy, z[1]), r, segments, r_top, name)


def lathe(root, material, profile, cx=0.0, cy=0.0, segments=24, turn=0.0, sharp_deg=35.0, sweep=2 * math.pi,
          name="lathe"):
    """Solid of revolution about the vertical axis through (cx, cy). `profile` is [(radius, z), ...]
    running from the axis at the bottom, out, up and back in (so a vessel's inner wall is part of
    it). segments=4 with turn=pi/4 gives an axis-aligned square vessel; pass corner radii. A
    `sweep` under a full turn gives an open arc starting at +X, counter-clockwise (towards +Y)."""
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0.0, z)) for r, z in profile]
    edges = [bm.edges.new(pair) for pair in zip(verts, verts[1:])]
    full = sweep >= 2 * math.pi - 1e-6
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0.0, 0.0, 0.0), axis=(0.0, 0.0, 1.0),
                   angle=sweep, steps=segments, use_merge=full)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((cx, cy, 0.0)) @ Matrix.Rotation(turn, 4, "Z"), verts=bm.verts)
    obj = _link(name, bm, material, root, smooth=True)
    obj.data.set_sharp_from_angle(angle=math.radians(sharp_deg))  # crisp rims and corners, smooth walls
    return obj


def rounded_rect(hx, hy, r, steps=3):
    """Outline of an axis-aligned rectangle with half-sizes (hx, hy) and corner radius r,
    counter-clockwise from the +X side; always 4 * (steps + 1) points."""
    r = min(r, 0.95 * min(hx, hy))
    points = []
    for (sx, sy), start in zip(((1, 1), (-1, 1), (-1, -1), (1, -1)), (0, 90, 180, 270)):
        cx, cy = sx * (hx - r), sy * (hy - r)
        for k in range(steps + 1):
            a = math.radians(start + 90 * k / steps)
            points.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return points


def loft(root, material, rings, cap_first=False, cap_last=False, sharp_deg=50.0, name="loft"):
    """Surface through closed outlines [(z, [(x, y), ...]), ...] that share a point count, bottom to
    top; optional caps close the first or last ring (a vessel's base, a lid)."""
    bm = bmesh.new()
    loops = [[bm.verts.new((x, y, z)) for x, y in outline] for z, outline in rings]
    n = len(loops[0])
    for a, b in zip(loops, loops[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    if cap_first:
        bm.faces.new(list(reversed(loops[0])))
    if cap_last:
        bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _link(name, bm, material, root, smooth=True)
    obj.data.set_sharp_from_angle(angle=math.radians(sharp_deg))
    return obj


def extrude(root, material, outline, y, bevel=0.0, tilt=0.0, pivot=(0.0, 0.0), name="extrude"):
    """Prism from a convex outline [(x, z), ...] in the front (XZ) plane, spanning y=(y0, y1); then
    reclined by `tilt` radians about the X axis through pivot (y, z) (negative leans the top back)."""
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((x, y[0], z)) for x, z in outline])
    grown = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, vec=(0.0, y[1] - y[0], 0.0),
                        verts=[g for g in grown["geom"] if isinstance(g, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0.0005:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, profile=0.5, affect="EDGES")
    if tilt:
        about = Matrix.Translation((0.0, pivot[0], pivot[1]))
        bmesh.ops.transform(bm, matrix=about @ Matrix.Rotation(tilt, 4, "X") @ about.inverted(), verts=bm.verts)
    obj = _link(name, bm, material, root, smooth=True)
    obj.data.set_sharp_from_angle(angle=math.radians(40))
    return obj


LEAF_SHAPES = {
    # half-width along the blade (0 = base, 1 = tip), as a fraction of the widest point
    "ovate": lambda t: math.sin(math.pi * t ** 0.75) ** 0.9,
    "lance": lambda t: math.sin(math.pi * t) ** 1.3,
    "heart": lambda t: math.sin(math.pi * t ** 0.55),
    "sword": lambda t: min(1.0, t * 8.0) * (1.0 - t ** 4) ** 0.5,
    "frond": lambda t: math.sin(math.pi * t) ** 0.8 * (0.35 + 0.65 * abs(math.sin(t * 9 * math.pi))),
}


def leaf(root, material, base, yaw, pitch, length, width, shape="ovate", droop=0.3, fold=0.35,
         twist=0.0, segments=6, name="leaf"):
    """One leaf blade from `base`: heading `yaw`, rising at `pitch` (radians), bending down by
    `droop` x length at the tip, with its edges lifted `fold` x half-width above the midrib so it
    catches light like a real leaf. Single-sided; the material renders both faces."""
    profile = LEAF_SHAPES[shape]
    heading = Vector((math.cos(pitch) * math.cos(yaw), math.cos(pitch) * math.sin(yaw), math.sin(pitch)))
    side0 = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
    bm = bmesh.new()
    rows = []
    for i in range(segments + 1):
        t = i / segments
        centre = Vector(base) + heading * (length * t) - Vector((0.0, 0.0, droop * length * t * t))
        tangent = (heading * length - Vector((0.0, 0.0, 2 * droop * length * t))).normalized()
        side = Matrix.Rotation(twist * t, 3, tangent) @ (side0 - tangent * side0.dot(tangent)).normalized()
        up = side.cross(tangent)
        half = 0.5 * width * profile(t)
        if i == segments or half < 1e-4:
            rows.append([bm.verts.new(centre)])
            continue
        rows.append([bm.verts.new(centre - side * half + up * (fold * half)), bm.verts.new(centre),
                     bm.verts.new(centre + side * half + up * (fold * half))])
    for a, b in zip(rows, rows[1:]):
        if len(a) == 3 and len(b) == 3:
            bm.faces.new((a[0], a[1], b[1], b[0]))
            bm.faces.new((a[1], a[2], b[2], b[1]))
        elif len(a) == 3:
            bm.faces.new((a[0], a[1], b[0]))
            bm.faces.new((a[1], a[2], b[0]))
        elif len(b) == 3:
            bm.faces.new((a[0], b[1], b[0]))
            bm.faces.new((a[0], b[2], b[1]))
    return _link(name, bm, material, root, smooth=True)


def blob(root, material, centre, radii, rotate=(0.0, 0.0, 0.0), segments=10, rings=6, name="blob"):
    """Ellipsoid with the given semi-axes, rotated about its centre (leaves, cushions, shades)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    bmesh.ops.scale(bm, vec=radii, verts=bm.verts)
    transform = Matrix.Translation(Vector(centre)) @ Euler(rotate).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=transform, verts=bm.verts)
    return _link(name, bm, material, root, smooth=True)
