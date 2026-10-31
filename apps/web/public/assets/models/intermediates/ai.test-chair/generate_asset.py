
import bpy
import bmesh
import math
from mathutils import Vector, Matrix

# Reset scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def get_pbr_material(name, rgb, roughness, metallic, alpha=1.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if alpha < 1.0:
        bsdf.inputs['Alpha'].default_value = alpha
        mat.blend_method = 'BLEND'
    return mat

# Material dictionary
PALETTE = {
    "oak":         ((0.78, 0.55, 0.30), 0.45, 0.0),
    "oak_light":   ((0.85, 0.63, 0.38), 0.45, 0.0),
    "charcoal":    ((0.18, 0.21, 0.23), 0.72, 0.1),
    "black_metal": ((0.12, 0.14, 0.16), 0.65, 0.35),
    "glass_pale":  ((0.72, 0.82, 0.84), 0.10, 0.1),
    "white_lam":   ((0.94, 0.92, 0.88), 0.50, 0.0),
    "grey_fabric": ((0.28, 0.32, 0.34), 0.88, 0.0),
    "leaf_green":  ((0.26, 0.52, 0.30), 0.60, 0.0),
    "ceramic":     ((0.95, 0.93, 0.89), 0.28, 0.0),
    "terracotta":  ((0.76, 0.42, 0.28), 0.80, 0.0),
    "screen_dark": ((0.12, 0.15, 0.18), 0.25, 0.2),
    "brass":       ((0.85, 0.68, 0.32), 0.35, 0.85),
}

mat_primary_data = PALETTE.get("screen_dark", PALETTE["oak"])
mat_sec_data = PALETTE.get("charcoal", PALETTE["black_metal"])
mat_primary = get_pbr_material("Primary_screen_dark", mat_primary_data[0], mat_primary_data[1], mat_primary_data[2])
mat_sec = get_pbr_material("Sec_charcoal", mat_sec_data[0], mat_sec_data[1], mat_sec_data[2])

CATEGORY = "chair"
W, D, H = 0.65, 0.62, 0.95

if CATEGORY == "chair":
    # 1. 5-star arched base with casters
    bpy.ops.mesh.primitive_cylinder_add(radius=0.038, depth=0.12, location=(0, 0, 0.08))
    hub = bpy.context.active_object
    hub.name = "Chair_BaseHub"
    hub.data.materials.append(mat_sec)

    for i in range(5):
        ang = i * (2 * math.pi / 5.0)
        bx, by = 0.28 * math.cos(ang), 0.28 * math.sin(ang)
        # Leg spoke
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx*0.5, by*0.5, 0.06))
        spoke = bpy.context.active_object
        spoke.scale = (0.28, 0.032, 0.02)
        spoke.rotation_euler.z = ang
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        spoke.data.materials.append(mat_sec)
        # Caster wheel
        bpy.ops.mesh.primitive_cylinder_add(radius=0.028, depth=0.025, location=(bx, by, 0.03))
        caster = bpy.context.active_object
        caster.rotation_euler.x = math.pi / 2
        bpy.ops.object.transform_apply(rotation=True)
        caster.data.materials.append(mat_sec)

    # 2. Lift cylinder
    bpy.ops.mesh.primitive_cylinder_add(radius=0.024, depth=0.28, location=(0, 0, 0.24))
    cylinder = bpy.context.active_object
    cylinder.name = "Chair_Cylinder"
    cylinder.data.materials.append(mat_sec)

    # 3. Contoured seat pan with waterfall front
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.02, 0.44))
    seat = bpy.context.active_object
    seat.name = "Chair_Seat"
    seat.scale = (W * 0.75, D * 0.72, 0.07)
    bpy.ops.object.transform_apply(scale=True)
    mod = seat.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.022
    mod.segments = 3
    bpy.ops.object.modifier_apply(modifier="Bevel")
    seat.data.materials.append(mat_primary)

    # 4. Ergonomic mesh backrest with lumbar curve
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.22, 0.74))
    back = bpy.context.active_object
    back.name = "Chair_Back"
    back.scale = (W * 0.68, 0.045, H * 0.48)
    back.rotation_euler.x = math.radians(-7.0)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    mod = back.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.018
    mod.segments = 3
    bpy.ops.object.modifier_apply(modifier="Bevel")
    back.data.materials.append(mat_primary)

    # 5. Armrests
    for s in [-1, 1]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(s * (W * 0.38), -0.02, 0.60))
        arm = bpy.context.active_object
        arm.scale = (0.055, 0.26, 0.035)
        bpy.ops.object.transform_apply(scale=True)
        arm.data.materials.append(mat_sec)
        # Arm upright support
        bpy.ops.mesh.primitive_cylinder_add(radius=0.016, depth=0.18, location=(s * (W * 0.38), -0.05, 0.50))
        post = bpy.context.active_object
        post.data.materials.append(mat_sec)

elif CATEGORY in ["desk", "work_desk"]:
    # 1. Desktop slab with chamfered edge
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, H - 0.02))
    top = bpy.context.active_object
    top.name = "Desk_Top"
    top.scale = (W, D, 0.04)
    bpy.ops.object.transform_apply(scale=True)
    mod = top.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.012
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier="Bevel")
    top.data.materials.append(mat_primary)

    # 2. Steel frame & legs
    for sx in [-W/2 + 0.06, W/2 - 0.06]:
        # Leg upright
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx, 0, (H - 0.04) / 2))
        leg = bpy.context.active_object
        leg.scale = (0.045, D * 0.88, H - 0.04)
        bpy.ops.object.transform_apply(scale=True)
        leg.data.materials.append(mat_sec)

    # 3. Acoustic partition screen
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, D/2 - 0.02, H + 0.16))
    divider = bpy.context.active_object
    divider.name = "Desk_Divider"
    divider.scale = (W * 0.96, 0.032, 0.32)
    bpy.ops.object.transform_apply(scale=True)
    mat_fabric = get_pbr_material("Acoustic_Felt", (0.32, 0.45, 0.42), 0.88, 0.0)
    divider.data.materials.append(mat_fabric)

elif CATEGORY in ["meeting_table", "table"]:
    # 1. Rounded-end conference table top
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, H - 0.022))
    top = bpy.context.active_object
    top.name = "Table_Top"
    top.scale = (W, D, 0.044)
    bpy.ops.object.transform_apply(scale=True)
    mod = top.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.035
    mod.segments = 3
    bpy.ops.object.modifier_apply(modifier="Bevel")
    top.data.materials.append(mat_primary)

    # 2. Center connectivity trough
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, H - 0.005))
    trough = bpy.context.active_object
    trough.scale = (W * 0.28, 0.14, 0.015)
    bpy.ops.object.transform_apply(scale=True)
    trough.data.materials.append(mat_sec)

    # 3. Architectural trapezoid trestle legs
    for sx in [-W * 0.34, W * 0.34]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx, 0, (H - 0.04) / 2))
        leg = bpy.context.active_object
        leg.scale = (0.06, D * 0.72, H - 0.04)
        bpy.ops.object.transform_apply(scale=True)
        leg.data.materials.append(mat_sec)

elif CATEGORY == "plant":
    # 1. Cylindrical ceramic/terracotta pot
    pot_h = H * 0.38
    pot_r = W * 0.42
    bpy.ops.mesh.primitive_cylinder_add(radius=pot_r, depth=pot_h, location=(0, 0, pot_h / 2), vertices=24)
    pot = bpy.context.active_object
    pot.name = "Plant_Pot"
    mod = pot.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.02
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier="Bevel")
    pot.data.materials.append(mat_sec)

    # 2. Rich dark soil disc
    bpy.ops.mesh.primitive_cylinder_add(radius=pot_r * 0.94, depth=0.03, location=(0, 0, pot_h - 0.02), vertices=20)
    soil = bpy.context.active_object
    mat_soil = get_pbr_material("Pot_Soil", (0.16, 0.12, 0.10), 0.95, 0.0)
    soil.data.materials.append(mat_soil)

    # 3. Layered architectural foliage
    foliage_base_z = pot_h
    leaf_mat = mat_primary
    for layer in range(4):
        lz = foliage_base_z + (layer + 1) * ((H - pot_h) / 4.5)
        num_leaves = 5 + layer
        for li in range(num_leaves):
            ang = (li * (2 * math.pi / num_leaves)) + (layer * 0.45)
            lx = math.cos(ang) * (W * (0.35 - layer * 0.05))
            ly = math.sin(ang) * (D * (0.35 - layer * 0.05))
            bpy.ops.mesh.primitive_cone_add(radius1=0.11, depth=0.28, location=(lx*0.5, ly*0.5, lz), vertices=8)
            leaf = bpy.context.active_object
            leaf.scale = (1.0, 0.35, 1.0)
            leaf.rotation_euler = (math.radians(35), math.radians(-15), ang)
            bpy.ops.object.transform_apply(scale=True, rotation=True)
            leaf.data.materials.append(leaf_mat)

elif CATEGORY == "printer":
    # 1. Base storage cabinet
    cab_h = H * 0.52
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, cab_h / 2))
    cab = bpy.context.active_object
    cab.scale = (W, D, cab_h)
    bpy.ops.object.transform_apply(scale=True)
    cab.data.materials.append(mat_sec)

    # 2. Printer body
    pr_h = H * 0.44
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, cab_h + pr_h / 2))
    pr = bpy.context.active_object
    pr.scale = (W * 0.92, D * 0.88, pr_h)
    bpy.ops.object.transform_apply(scale=True)
    mod = pr.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.02
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier="Bevel")
    pr.data.materials.append(mat_primary)

    # 3. Touch control panel screen
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(W * 0.28, -D * 0.36, cab_h + pr_h * 0.85))
    screen = bpy.context.active_object
    screen.scale = (0.16, 0.12, 0.02)
    screen.rotation_euler.x = math.radians(-30)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    mat_screen = get_pbr_material("Control_Screen", (0.15, 0.45, 0.55), 0.15, 0.3)
    screen.data.materials.append(mat_screen)

else:
    # Generic prop box with chamfer
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, H / 2))
    prop = bpy.context.active_object
    prop.scale = (W, D, H)
    bpy.ops.object.transform_apply(scale=True)
    mod = prop.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.02
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier="Bevel")
    prop.data.materials.append(mat_primary)

# Save intermediate raw blend
bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\devd9\muse-sandbox\meta-virtual\apps\web\public\assets\models\intermediates\ai.test-chair\stage_b_raw.blend")
print("Generated stage B raw blend successfully!")
