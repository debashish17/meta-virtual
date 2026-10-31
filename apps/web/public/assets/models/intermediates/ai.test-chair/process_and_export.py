
import bpy
import bmesh
import math
import os
from mathutils import Vector

bpy.ops.wm.open_mainfile(filepath=r"C:\Users\devd9\muse-sandbox\meta-virtual\apps\web\public\assets\models\intermediates\ai.test-chair\stage_b_raw.blend")

# 1. Select all mesh objects and convert to unified mesh
mesh_objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in mesh_objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = mesh_objs[0]

# Convert all curves/modifiers to mesh
bpy.ops.object.convert(target='MESH')
bpy.ops.object.join()
hero = bpy.context.view_layer.objects.active
hero.name = "VirtualOffice_Asset"

# 2. Stage C: Geometry Cleanup (Degenerates, Normals, Doubles)
bpy.ops.object.mode_set(mode='EDIT')
bm = bmesh.from_edit_mesh(hero.data)

# Remove doubles (vertex welding)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)

# Dissolve degenerate faces (zero area)
bmesh.ops.dissolve_degenerate(bm, dist=0.0005, edges=bm.edges)

# Recalculate face normals outward
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bmesh.update_edit_mesh(hero.data)
bpy.ops.object.mode_set(mode='OBJECT')

# 3. Stage E: Scale, Orientation & Ground Normalization
# Compute bounding box
bbox = [hero.matrix_world @ Vector(corner) for corner in hero.bound_box]
min_x = min(v.x for v in bbox)
max_x = max(v.x for v in bbox)
min_y = min(v.y for v in bbox)
max_y = max(v.y for v in bbox)
min_z = min(v.z for v in bbox)
max_z = max(v.z for v in bbox)

cur_w = max(0.001, max_x - min_x)
cur_d = max(0.001, max_y - min_y)
cur_h = max(0.001, max_z - min_z)

# Normalize scale to target dimensions while maintaining aspect proportions
scale_factor = 0.95 / cur_h
hero.scale = (scale_factor, scale_factor, scale_factor)
bpy.ops.object.transform_apply(scale=True)

# Recompute bounds after scale
bbox = [hero.matrix_world @ Vector(corner) for corner in hero.bound_box]
min_x = min(v.x for v in bbox)
max_x = max(v.x for v in bbox)
min_y = min(v.y for v in bbox)
max_y = max(v.y for v in bbox)
min_z = min(v.z for v in bbox)

center_x = (min_x + max_x) / 2.0
center_y = (min_y + max_y) / 2.0

# Translate so origin is at bottom center (Z=0, X=0, Y=0)
for v in hero.data.vertices:
    v.co.x -= center_x
    v.co.y -= center_y
    v.co.z -= min_z
hero.data.update()

# 4. Stage F: Real-time Decimation Optimization
initial_tris = len(hero.data.polygons)
target_tris = 4800

if initial_tris > target_tris:
    ratio = max(0.1, target_tris / initial_tris)
    mod = hero.modifiers.new("Decimate", type='DECIMATE')
    mod.ratio = ratio
    bpy.ops.object.modifier_apply(modifier="Decimate")

final_verts = len(hero.data.vertices)
final_tris = len(hero.data.polygons)

# Compute final metric bounds
bbox = [hero.matrix_world @ Vector(corner) for corner in hero.bound_box]
fin_w = max(v.x for v in bbox) - min(v.x for v in bbox)
fin_d = max(v.y for v in bbox) - min(v.y for v in bbox)
fin_h = max(v.z for v in bbox) - min(v.z for v in bbox)

# 5. Stage G: Self-contained GLB Export
os.makedirs(os.path.dirname(r"apps/web/public/assets/models/ai.test-chair.glb"), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=r"apps/web/public/assets/models/ai.test-chair.glb",
    use_selection=True,
    export_format='GLB',
    export_apply=True,
    export_materials='EXPORT',
    export_yup=True
)

stats = {
    "final_verts": final_verts,
    "final_tris": final_tris,
    "bounds": [round(fin_w, 4), round(fin_d, 4), round(fin_h, 4)],
    "file_size": os.path.getsize(r"apps/web/public/assets/models/ai.test-chair.glb")
}
with open(r"C:\Users\devd9\muse-sandbox\meta-virtual\apps\web\public\assets\models\intermediates\ai.test-chair\export_stats.json", "w") as f:
    json.dump(stats, f)
