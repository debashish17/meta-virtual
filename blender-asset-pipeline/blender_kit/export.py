"""Scene reset, join, origin normalisation, measurement and GLB export (ported from v1)."""

import bmesh
import bpy
from mathutils import Matrix, Vector

from .materials import TEXTURES


def clear_scene() -> None:
    """Remove everything except the kit's own camera and lights (see render._setup)."""
    for obj in list(bpy.data.objects):
        if not obj.name.startswith("Kit"):
            bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def join(root: bpy.types.Object, name: str) -> bpy.types.Object:
    """Bake every mesh child of `root` into one mesh object, merging materials by name."""
    bpy.context.view_layer.update()
    children = sorted((c for c in root.children if c.type == "MESH"), key=lambda c: c.name)  # creation order
    materials: list = []
    combined = bmesh.new()
    for child in children:
        mapping = {}
        for i, m in enumerate(child.data.materials):
            if m not in materials:
                materials.append(m)
            mapping[i] = materials.index(m)
        mesh = child.data.copy()
        mesh.transform(child.matrix_world)
        for poly in mesh.polygons:
            poly.material_index = mapping.get(poly.material_index, 0)
        combined.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
    _box_uvs(combined, materials)
    data = bpy.data.meshes.new(name)
    combined.to_mesh(data)
    combined.free()
    for m in materials:
        data.materials.append(m)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    for child in children:
        bpy.data.objects.remove(child, do_unlink=True)
    bpy.data.objects.remove(root, do_unlink=True)
    return obj


def _box_uvs(bm: bmesh.types.BMesh, materials: list) -> None:
    """Box-projected UVs in units of each material's texture tile: every face maps from the two axes
    it lies along, with u on its longer side so wood grain runs along a board or leg."""
    uv = bm.loops.layers.uv.new("UVMap")
    for face in bm.faces:
        name = materials[face.material_index].name.removeprefix("VO_") if materials else ""
        tile = TEXTURES.get(name, (None, 1.0))[1]
        normal = face.normal
        axis = max(range(3), key=lambda a: abs(normal[a]))
        a, b = [i for i in range(3) if i != axis]
        cos = [loop.vert.co for loop in face.loops]
        if max(c[b] for c in cos) - min(c[b] for c in cos) > max(c[a] for c in cos) - min(c[a] for c in cos):
            a, b = b, a
        for loop in face.loops:
            loop[uv].uv = (loop.vert.co[a] / tile, loop.vert.co[b] / tile)


def bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    xs, ys, zs = zip(*(v.co[:] for v in obj.data.vertices))
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def finalize(obj: bpy.types.Object) -> None:
    """Origin at the floor centre of the footprint. Nothing is rescaled here: builders size their
    parts directly (foliage is fitted to its box in families/foliage.py, pots never stretch)."""
    lo, hi = bounds(obj)
    obj.data.transform(Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))
    obj.data.update()


def measure(obj: bpy.types.Object) -> dict:
    lo, hi = bounds(obj)
    size = hi - lo
    return {"w": round(size.x, 4), "d": round(size.y, 4), "h": round(size.z, 4)}


def triangles(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def export_glb(obj: bpy.types.Object, path: str) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
                              export_image_format="JPEG", export_jpeg_quality=85)
