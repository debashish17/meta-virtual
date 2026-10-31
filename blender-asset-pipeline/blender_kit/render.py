"""Fixed-scale isometric thumbnails: every asset is rendered at the same pixels-per-metre, so a
review sheet shows true relative sizes (v2 stretched every render to the same box, hiding scale
errors). The image size follows the asset; the camera matches the app (45° azimuth, 35.264°)."""

import math

import bpy
from mathutils import Vector

AZIMUTH, ELEVATION = math.radians(45), math.radians(35.264)
MARGIN_PX = 6


def _setup(scene: bpy.types.Scene) -> bpy.types.Object:
    """Create the kit camera, lights and render settings once; drop the startup scene's own."""
    cam = bpy.data.objects.get("KitCamera")
    if cam is None:
        for obj in [o for o in scene.objects if o.type in ("CAMERA", "LIGHT")]:
            bpy.data.objects.remove(obj, do_unlink=True)
        data = bpy.data.cameras.new("KitCamera")
        data.type = "ORTHO"
        cam = bpy.data.objects.new("KitCamera", data)
        scene.collection.objects.link(cam)
        scene.camera = cam
        for name, energy, rotation in (("KitKey", 3.5, (45, 20, -35)), ("KitFill", 1.4, (-35, -20, 150))):
            light = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
            light.data.energy = energy
            light.rotation_euler = tuple(math.radians(a) for a in rotation)
            scene.collection.objects.link(light)
        world = scene.world or bpy.data.worlds.new("KitWorld")
        scene.world = world
        world.use_nodes = True
        world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.55, 0.55, 1.0)
        world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
        for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH"):
            try:
                scene.render.engine = engine
                break
            except TypeError:
                continue
        if hasattr(scene, "eevee"):
            scene.eevee.taa_render_samples = 16
        scene.view_settings.view_transform = "Standard"
        scene.render.film_transparent = True
        scene.render.image_settings.file_format = "PNG"
        scene.render.image_settings.color_mode = "RGBA"
    return cam


def render(obj: bpy.types.Object, path: str, px_per_m: float) -> dict:
    scene = bpy.context.scene
    cam = _setup(scene)
    forward = Vector((-math.cos(ELEVATION) * math.sin(AZIMUTH), math.cos(ELEVATION) * math.cos(AZIMUTH),
                      -math.sin(ELEVATION)))
    right = forward.cross(Vector((0, 0, 1))).normalized()
    up = right.cross(forward).normalized()

    corners = [Vector(c) for c in obj.bound_box]
    us = [c.dot(right) for c in corners]
    vs = [c.dot(up) for c in corners]
    width_m, height_m = max(us) - min(us), max(vs) - min(vs)
    centre = sum(corners, Vector()) / 8

    res_x = max(16, math.ceil(width_m * px_per_m) + 2 * MARGIN_PX)
    res_y = max(16, math.ceil(height_m * px_per_m) + 2 * MARGIN_PX)
    scene.render.resolution_x, scene.render.resolution_y = res_x, res_y
    scene.render.resolution_percentage = 100
    cam.data.ortho_scale = max(res_x, res_y) / px_per_m
    cam.location = centre - forward * 20.0
    cam.rotation_euler = forward.to_track_quat("-Z", "Y").to_euler()
    cam.data.clip_end = 100.0

    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return {"width": res_x, "height": res_y, "pxPerM": px_per_m}
