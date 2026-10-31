
import bpy
import bmesh
import math
import os
import json
from mathutils import Vector

# 1. Clean scene completely without UI context dependency
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.meshes):
    bpy.data.meshes.remove(m, do_unlink=True)
for mat in list(bpy.data.materials):
    bpy.data.materials.remove(mat, do_unlink=True)

# 2. PBR Material Helper
def make_pbr_material(name, rgb, roughness, metallic, alpha=1.0):
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

mat_p_data = PALETTE.get("screen_dark", PALETTE["oak"])
mat_s_data = PALETTE.get("grey_fabric", PALETTE["black_metal"])
mat_primary = make_pbr_material("Mat_screen_dark", mat_p_data[0], mat_p_data[1], mat_p_data[2])
mat_sec = make_pbr_material("Mat_grey_fabric", mat_s_data[0], mat_s_data[1], mat_s_data[2])

CATEGORY = "desk"
W, D, H = 1.4, 0.75, 0.75

# 3. Procedural Geometry Construction
if CATEGORY == "chair":
    # 5-star arched base with casters
    bpy.ops.mesh.primitive_cylinder_add(radius=0.038, depth=0.12, location=(0, 0, 0.08))
    hub = bpy.context.active_object
    hub.data.materials.append(mat_sec)

    for i in range(5):
        ang = i * (2 * math.pi / 5.0)
        bx, by = 0.28 * math.cos(ang), 0.28 * math.sin(ang)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx*0.5, by*0.5, 0.06))
        spoke = bpy.context.active_object
        spoke.scale = (0.28, 0.032, 0.02)
        spoke.rotation_euler.z = ang
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        spoke.data.materials.append(mat_sec)

        bpy.ops.mesh.primitive_cylinder_add(radius=0.028, depth=0.025, location=(bx, by, 0.03))
        caster = bpy.context.active_object
        caster.rotation_euler.x = math.pi / 2
        bpy.ops.object.transform_apply(rotation=True)
        caster.data.materials.append(mat_sec)

    # Lift cylinder
    bpy.ops.mesh.primitive_cylinder_add(radius=0.024, depth=0.28, location=(0, 0, 0.24))
    cyl = bpy.context.active_object
    cyl.data.materials.append(mat_sec)

    # Seat cushion
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.02, 0.44))
    seat = bpy.context.active_object
    seat.scale = (W * 0.75, D * 0.72, 0.07)
    bpy.ops.object.transform_apply(scale=True)
    mod = seat.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.022
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier="Bevel")
    seat.data.materials.append(mat_primary)

    # Backrest
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.22, 0.74))
    back = bpy.context.active_object
    back.scale = (W * 0.68, 0.045, H * 0.48)
    back.rotation_euler.x = math.radians(-7.0)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    mod = back.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.018
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier="Bevel")
    back.data.materials.append(mat_primary)

    # Armrests
    for s in [-1, 1]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(s * (W * 0.38), -0.02, 0.60))
        arm = bpy.context.active_object
        arm.scale = (0.055, 0.26, 0.035)
        bpy.ops.object.transform_apply(scale=True)
        arm.data.materials.append(mat_sec)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.016, depth=0.18, location=(s * (W * 0.38), -0.05, 0.50))
        post = bpy.context.active_object
        post.data.materials.append(mat_sec)

elif CATEGORY in ["desk", "work_desk"]:
    # Desktop slab
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, H - 0.02))
    top = bpy.context.active_object
    top.scale = (W, D, 0.04)
    bpy.ops.object.transform_apply(scale=True)
    mod = top.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.012
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier="Bevel")
    top.data.materials.append(mat_primary)

    # Steel legs
    for sx in [-W/2 + 0.06, W/2 - 0.06]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx, 0, (H - 0.04) / 2))
        leg = bpy.context.active_object
        leg.scale = (0.045, D * 0.88, H - 0.04)
        bpy.ops.object.transform_apply(scale=True)
        leg.data.materials.append(mat_sec)

    # Acoustic partition
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, D/2 - 0.02, H + 0.16))
    divider = bpy.context.active_object
    divider.scale = (W * 0.96, 0.032, 0.32)
    bpy.ops.object.transform_apply(scale=True)
    mat_felt = make_pbr_material("Mat_AcousticFelt", (0.32, 0.45, 0.42), 0.88, 0.0)
    divider.data.materials.append(mat_felt)

elif CATEGORY in ["meeting_table", "table"]:
    # Table top
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, H - 0.022))
    top = bpy.context.active_object
    top.scale = (W, D, 0.044)
    bpy.ops.object.transform_apply(scale=True)
    mod = top.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.035
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier="Bevel")
    top.data.materials.append(mat_primary)

    # Connectivity trough
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, H - 0.005))
    trough = bpy.context.active_object
    trough.scale = (W * 0.28, 0.14, 0.015)
    bpy.ops.object.transform_apply(scale=True)
    trough.data.materials.append(mat_sec)

    # Trapezoid trestle legs
    for sx in [-W * 0.34, W * 0.34]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx, 0, (H - 0.04) / 2))
        leg = bpy.context.active_object
        leg.scale = (0.06, D * 0.72, H - 0.04)
        bpy.ops.object.transform_apply(scale=True)
        leg.data.materials.append(mat_sec)

elif CATEGORY == "plant":
    # Ceramic/terracotta pot
    pot_h = H * 0.38
    pot_r = W * 0.42
    bpy.ops.mesh.primitive_cylinder_add(radius=pot_r, depth=pot_h, location=(0, 0, pot_h / 2), vertices=24)
    pot = bpy.context.active_object
    mod = pot.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.02
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier="Bevel")
    pot.data.materials.append(mat_sec)

    # Soil disc
    bpy.ops.mesh.primitive_cylinder_add(radius=pot_r * 0.94, depth=0.03, location=(0, 0, pot_h - 0.02), vertices=20)
    soil = bpy.context.active_object
    mat_soil = make_pbr_material("Mat_Soil", (0.16, 0.12, 0.10), 0.95, 0.0)
    soil.data.materials.append(mat_soil)

    # Foliage layers
    foliage_base_z = pot_h
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
            leaf.data.materials.append(mat_primary)

elif CATEGORY == "printer":
    cab_h = H * 0.52
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, cab_h / 2))
    cab = bpy.context.active_object
    cab.scale = (W, D, cab_h)
    bpy.ops.object.transform_apply(scale=True)
    cab.data.materials.append(mat_sec)

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

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(W * 0.28, -D * 0.36, cab_h + pr_h * 0.85))
    screen = bpy.context.active_object
    screen.scale = (0.16, 0.12, 0.02)
    screen.rotation_euler.x = math.radians(-30)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    mat_screen = make_pbr_material("Mat_Screen", (0.15, 0.45, 0.55), 0.15, 0.3)
    screen.data.materials.append(mat_screen)

elif CATEGORY == "armchair":
    leg_h = 0.28
    for lx in [-W*0.38, W*0.38]:
        for ly in [-D*0.38, D*0.38]:
            bpy.ops.mesh.primitive_cylinder_add(radius=0.022, depth=leg_h, location=(lx, ly, leg_h/2), vertices=12)
            leg = bpy.context.active_object
            leg.data.materials.append(mat_sec)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.02, leg_h + 0.08))
    seat = bpy.context.active_object
    seat.scale = (W * 0.72, D * 0.74, 0.16)
    bpy.ops.object.transform_apply(scale=True)
    mod = seat.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.035
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier="Bevel")
    seat.data.materials.append(mat_primary)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -D*0.32, leg_h + 0.32))
    back = bpy.context.active_object
    back.scale = (W * 0.70, 0.12, H * 0.48)
    back.rotation_euler.x = math.radians(-8.0)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    mod = back.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.03
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier="Bevel")
    back.data.materials.append(mat_primary)
    for s in [-1, 1]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(s * (W * 0.42), -0.02, leg_h + 0.22))
        arm = bpy.context.active_object
        arm.scale = (0.07, D * 0.82, 0.04)
        bpy.ops.object.transform_apply(scale=True)
        mod = arm.modifiers.new("Bevel", type='BEVEL')
        mod.width = 0.012
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier="Bevel")
        arm.data.materials.append(mat_sec)

elif CATEGORY == "sofa":
    foot_h = 0.14
    for fx in [-W*0.42, W*0.42]:
        for fy in [-D*0.38, D*0.38]:
            bpy.ops.mesh.primitive_cylinder_add(radius=0.03, depth=foot_h, location=(fx, fy, foot_h/2), vertices=12)
            f = bpy.context.active_object
            f.data.materials.append(mat_sec)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, foot_h + 0.08))
    deck = bpy.context.active_object
    deck.scale = (W, D * 0.90, 0.16)
    bpy.ops.object.transform_apply(scale=True)
    mod = deck.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.02
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier="Bevel")
    deck.data.materials.append(mat_primary)
    for s in [-1, 1]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(s * (W * 0.23), -0.02, foot_h + 0.22))
        cush = bpy.context.active_object
        cush.scale = (W * 0.44, D * 0.72, 0.14)
        bpy.ops.object.transform_apply(scale=True)
        mod = cush.modifiers.new("Bevel", type='BEVEL')
        mod.width = 0.04
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier="Bevel")
        cush.data.materials.append(mat_primary)
    for s in [-1, 1]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(s * (W * 0.23), -D*0.32, foot_h + 0.42))
        back = bpy.context.active_object
        back.scale = (W * 0.43, 0.14, H * 0.42)
        back.rotation_euler.x = math.radians(-7.0)
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        mod = back.modifiers.new("Bevel", type='BEVEL')
        mod.width = 0.035
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier="Bevel")
        back.data.materials.append(mat_primary)
    for s in [-1, 1]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(s * (W * 0.45), 0, foot_h + 0.28))
        arm = bpy.context.active_object
        arm.scale = (0.12, D * 0.88, 0.28)
        bpy.ops.object.transform_apply(scale=True)
        mod = arm.modifiers.new("Bevel", type='BEVEL')
        mod.width = 0.03
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier="Bevel")
        arm.data.materials.append(mat_primary)

elif CATEGORY in ["coffee_table", "table_low"]:
    leg_h = H - 0.035
    for lx in [-W*0.38, W*0.38]:
        for ly in [-D*0.35, D*0.35]:
            bpy.ops.mesh.primitive_cylinder_add(radius=0.022, depth=leg_h, location=(lx, ly, leg_h/2), vertices=12)
            leg = bpy.context.active_object
            leg.rotation_euler.y = math.radians(6.0 * (1 if lx > 0 else -1))
            bpy.ops.object.transform_apply(rotation=True)
            leg.data.materials.append(mat_sec)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, H - 0.018))
    top = bpy.context.active_object
    top.scale = (W, D, 0.036)
    bpy.ops.object.transform_apply(scale=True)
    mod = top.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.025
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier="Bevel")
    top.data.materials.append(mat_primary)

elif CATEGORY in ["storage", "shelf", "bookshelf"]:
    for s in [-W/2 + 0.02, W/2 - 0.02]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(s, 0, H/2))
        post = bpy.context.active_object
        post.scale = (0.03, D, H)
        bpy.ops.object.transform_apply(scale=True)
        post.data.materials.append(mat_sec)
    num_shelves = 4
    for i in range(num_shelves):
        sz = 0.12 + i * ((H - 0.20) / (num_shelves - 1))
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, sz))
        sh = bpy.context.active_object
        sh.scale = (W * 0.96, D * 0.94, 0.028)
        bpy.ops.object.transform_apply(scale=True)
        mod = sh.modifiers.new("Bevel", type='BEVEL')
        mod.width = 0.008
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier="Bevel")
        sh.data.materials.append(mat_primary)
        if i == 1:
            for b in range(5):
                bx = -W*0.28 + b * 0.05
                bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, 0, sz + 0.12))
                book = bpy.context.active_object
                book.scale = (0.038, D * 0.65, 0.22)
                bpy.ops.object.transform_apply(scale=True)
                book.data.materials.append(mat_sec)

elif CATEGORY in ["cabinet", "credenza"]:
    foot_h = 0.10
    for fx in [-W*0.42, W*0.42]:
        for fy in [-D*0.38, D*0.38]:
            bpy.ops.mesh.primitive_cylinder_add(radius=0.022, depth=foot_h, location=(fx, fy, foot_h/2), vertices=12)
            f = bpy.context.active_object
            f.data.materials.append(mat_sec)
    cab_h = H - foot_h
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, foot_h + cab_h / 2))
    cab = bpy.context.active_object
    cab.scale = (W, D, cab_h)
    bpy.ops.object.transform_apply(scale=True)
    mod = cab.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.015
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier="Bevel")
    cab.data.materials.append(mat_primary)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -D/2 - 0.002, foot_h + cab_h / 2))
    groove = bpy.context.active_object
    groove.scale = (0.006, 0.01, cab_h * 0.88)
    bpy.ops.object.transform_apply(scale=True)
    groove.data.materials.append(mat_sec)

elif CATEGORY in ["whiteboard", "easel"]:
    for s in [-W*0.44, W*0.44]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(s, 0, 0.06))
        foot = bpy.context.active_object
        foot.scale = (0.04, D, 0.03)
        bpy.ops.object.transform_apply(scale=True)
        foot.data.materials.append(mat_sec)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(s, 0, H*0.48))
        up = bpy.context.active_object
        up.scale = (0.035, 0.035, H*0.92)
        bpy.ops.object.transform_apply(scale=True)
        up.data.materials.append(mat_sec)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.016, depth=W*0.88, location=(0, 0, 0.32), vertices=12)
    bar = bpy.context.active_object
    bar.rotation_euler.y = math.pi / 2
    bpy.ops.object.transform_apply(rotation=True)
    bar.data.materials.append(mat_sec)
    board_h = H * 0.58
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, H - board_h / 2 - 0.05))
    board = bpy.context.active_object
    board.scale = (W * 0.92, 0.024, board_h)
    bpy.ops.object.transform_apply(scale=True)
    mat_wb = make_pbr_material("Mat_Whiteboard", (0.96, 0.96, 0.95), 0.12, 0.0)
    board.data.materials.append(mat_wb)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.03, H - board_h - 0.04))
    tray = bpy.context.active_object
    tray.scale = (W * 0.70, 0.06, 0.015)
    bpy.ops.object.transform_apply(scale=True)
    tray.data.materials.append(mat_sec)

elif CATEGORY in ["phone_booth", "privacy_booth"]:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, H/2))
    shell = bpy.context.active_object
    shell.scale = (W, D, H)
    bpy.ops.object.transform_apply(scale=True)
    mod = shell.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.04
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier="Bevel")
    shell.data.materials.append(mat_primary)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -D/2 + 0.02, H/2))
    door = bpy.context.active_object
    door.scale = (W * 0.78, 0.018, H * 0.88)
    bpy.ops.object.transform_apply(scale=True)
    mat_glass = make_pbr_material("Mat_GlassPale", (0.75, 0.85, 0.88), 0.08, 0.1, alpha=0.35)
    door.data.materials.append(mat_glass)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.014, depth=0.45, location=(W*0.30, -D/2 - 0.02, H*0.48), vertices=12)
    handle = bpy.context.active_object
    handle.data.materials.append(mat_sec)

elif CATEGORY in ["tech_monitor", "monitor", "monitor_set"]:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.01))
    base = bpy.context.active_object
    base.scale = (W * 0.38, D * 0.45, 0.015)
    bpy.ops.object.transform_apply(scale=True)
    base.data.materials.append(mat_sec)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.016, depth=H*0.62, location=(0, -0.02, H*0.32), vertices=12)
    post = bpy.context.active_object
    post.data.materials.append(mat_sec)
    scr_w = W * 0.48
    scr_h = H * 0.65
    for s in [-1, 1]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(s * (scr_w * 0.52), -0.01, H*0.58))
        scr = bpy.context.active_object
        scr.scale = (scr_w, 0.02, scr_h)
        scr.rotation_euler.y = math.radians(12.0 * (-1 if s > 0 else 1))
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        mat_screen = make_pbr_material("Mat_MonitorDisplay", (0.12, 0.16, 0.20), 0.25, 0.3)
        scr.data.materials.append(mat_screen)

elif CATEGORY in ["wall_screen", "display"]:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, H/2))
    scr = bpy.context.active_object
    scr.scale = (W, D, H)
    bpy.ops.object.transform_apply(scale=True)
    mod = scr.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.008
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier="Bevel")
    mat_bezel = make_pbr_material("Mat_Bezel", (0.10, 0.12, 0.14), 0.40, 0.4)
    scr.data.materials.append(mat_bezel)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -D/2 - 0.002, H/2))
    face = bpy.context.active_object
    face.scale = (W * 0.96, 0.004, H * 0.94)
    bpy.ops.object.transform_apply(scale=True)
    mat_disp = make_pbr_material("Mat_WallDisplay", (0.15, 0.22, 0.28), 0.15, 0.1)
    face.data.materials.append(mat_disp)

elif CATEGORY in ["partition", "divider"]:
    for s in [-W*0.38, W*0.38]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(s, 0, 0.015))
        foot = bpy.context.active_object
        foot.scale = (0.05, D, 0.02)
        bpy.ops.object.transform_apply(scale=True)
        foot.data.materials.append(mat_sec)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, H/2 + 0.02))
    panel = bpy.context.active_object
    panel.scale = (W, 0.038, H - 0.04)
    bpy.ops.object.transform_apply(scale=True)
    mod = panel.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.025
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier="Bevel")
    mat_felt = make_pbr_material("Mat_AcousticFelt", (0.35, 0.44, 0.42), 0.90, 0.0)
    panel.data.materials.append(mat_felt)

else:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, H / 2))
    prop = bpy.context.active_object
    prop.scale = (W, D, H)
    bpy.ops.object.transform_apply(scale=True)
    mod = prop.modifiers.new("Bevel", type='BEVEL')
    mod.width = 0.02
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier="Bevel")
    prop.data.materials.append(mat_primary)

# 4. Join all objects into a unified hero mesh
mesh_objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if not mesh_objs:
    raise RuntimeError("No mesh objects were constructed!")

bpy.context.view_layer.objects.active = mesh_objs[0]
for o in mesh_objs:
    o.select_set(True)
bpy.ops.object.join()
hero = bpy.context.view_layer.objects.active
hero.name = "Hero_Asset"

# 5. Geometry Cleanup (Stage C)
bpy.ops.object.mode_set(mode='EDIT')
bm = bmesh.from_edit_mesh(hero.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
bmesh.ops.dissolve_degenerate(bm, dist=0.0005, edges=bm.edges)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bmesh.update_edit_mesh(hero.data)
bpy.ops.object.mode_set(mode='OBJECT')

# 6. Scale Normalization & Ground Origin Z=0 (Stage E)
bbox = [hero.matrix_world @ Vector(corner) for corner in hero.bound_box]
min_x, max_x = min(v.x for v in bbox), max(v.x for v in bbox)
min_y, max_y = min(v.y for v in bbox), max(v.y for v in bbox)
min_z, max_z = min(v.z for v in bbox), max(v.z for v in bbox)

cur_h = max(0.001, max_z - min_z)
scale_factor = 0.75 / cur_h
hero.scale = (scale_factor, scale_factor, scale_factor)
bpy.ops.object.transform_apply(scale=True)

# Translate so origin is at bottom center (Z=0, X=0, Y=0)
bbox = [hero.matrix_world @ Vector(corner) for corner in hero.bound_box]
min_x, max_x = min(v.x for v in bbox), max(v.x for v in bbox)
min_y, max_y = min(v.y for v in bbox), max(v.y for v in bbox)
min_z = min(v.z for v in bbox)

center_x = (min_x + max_x) / 2.0
center_y = (min_y + max_y) / 2.0

for v in hero.data.vertices:
    v.co.x -= center_x
    v.co.y -= center_y
    v.co.z -= min_z
hero.data.update()

# 7. Decimation Optimization (Stage F)
initial_tris = len(hero.data.polygons)
if initial_tris > 3500:
    ratio = max(0.1, 3500 / initial_tris)
    mod = hero.modifiers.new("Decimate", type='DECIMATE')
    mod.ratio = ratio
    bpy.ops.object.modifier_apply(modifier="Decimate")

final_verts = len(hero.data.vertices)
final_tris = len(hero.data.polygons)

# Compute final bounds
bbox = [hero.matrix_world @ Vector(corner) for corner in hero.bound_box]
fin_w = max(v.x for v in bbox) - min(v.x for v in bbox)
fin_d = max(v.y for v in bbox) - min(v.y for v in bbox)
fin_h = max(v.z for v in bbox) - min(v.z for v in bbox)

# 8. Export GLB (Stage G)
out_path = r"apps/web/public/assets/models/ai.desk-single.glb"
os.makedirs(os.path.dirname(out_path), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=out_path,
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
    "file_size": os.path.getsize(out_path)
}
with open(r"C:\Users\devd9\muse-sandbox\meta-virtual\apps\web\public\assets\models\intermediates\ai.desk-single\export_stats.json", "w") as f:
    json.dump(stats, f)

print("WORKER_SUCCESS")
