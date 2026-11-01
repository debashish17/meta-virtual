"""Shared materials. Base colours are linear RGB.

The six board tokens were sampled from the "STYLE & PALETTE" swatches printed on the catalogue
boards (sRGB -> linear): light grey (165,164,166), mid grey (142,141,140), oak (208,137,75),
charcoal (55,55,55), off-white (227,223,222), warm white (228,222,215). The v1 kit used a much
paler oak (0.79, 0.55, 0.30), which is why the office wood read as pale yellow. Other colours
(upholstery, foliage, accents) were picked from the board artwork.
"""

from pathlib import Path

import bpy
import numpy as np

# name: (rgb, roughness, metallic, alpha)
PALETTE = {
    # board swatches
    "grey_light":   ((0.380, 0.372, 0.385), 0.85, 0.0, 1.0),
    "grey_mid":     ((0.273, 0.266, 0.263), 0.85, 0.0, 1.0),
    "oak":          ((0.630, 0.250, 0.070), 0.45, 0.0, 1.0),
    "charcoal":     ((0.038, 0.038, 0.037), 0.60, 0.0, 1.0),
    "off_white":    ((0.770, 0.740, 0.730), 0.45, 0.0, 1.0),
    "warm_white":   ((0.780, 0.730, 0.685), 0.40, 0.0, 1.0),
    # derived finishes
    "oak_dark":     ((0.420, 0.150, 0.040), 0.45, 0.0, 1.0),
    "black_metal":  ((0.022, 0.023, 0.025), 0.45, 0.6, 1.0),
    "grey_metal":   ((0.300, 0.310, 0.320), 0.40, 0.7, 1.0),
    "stainless":    ((0.560, 0.570, 0.580), 0.30, 0.9, 1.0),
    "stone_black":  ((0.020, 0.020, 0.022), 0.30, 0.0, 1.0),
    "concrete":     ((0.400, 0.395, 0.380), 0.90, 0.0, 1.0),
    "glass":        ((0.600, 0.720, 0.720), 0.05, 0.0, 0.28),
    "frosted":      ((0.760, 0.800, 0.800), 0.40, 0.0, 0.80),
    "screen":       ((0.008, 0.010, 0.014), 0.15, 0.2, 1.0),
    # upholstery
    "leather":      ((0.420, 0.150, 0.045), 0.45, 0.0, 1.0),
    "fabric_cream": ((0.700, 0.640, 0.550), 0.90, 0.0, 1.0),
    "fabric_grey":  ((0.300, 0.300, 0.300), 0.90, 0.0, 1.0),
    "fabric_dark":  ((0.030, 0.030, 0.033), 0.90, 0.0, 1.0),
    "fabric_sage":  ((0.120, 0.190, 0.065), 0.90, 0.0, 1.0),
    "fabric_rust":  ((0.450, 0.110, 0.040), 0.85, 0.0, 1.0),
    # greenery
    # greenery: sampled from the plant crops (mid, shadow and lit leaves are olive, not blue-green)
    "leaf":         ((0.095, 0.180, 0.014), 0.55, 0.0, 1.0),
    "leaf_dark":    ((0.036, 0.088, 0.009), 0.55, 0.0, 1.0),
    "leaf_light":   ((0.190, 0.300, 0.040), 0.55, 0.0, 1.0),
    "leaf_snake":   ((0.055, 0.115, 0.028), 0.45, 0.0, 1.0),
    "stem":         ((0.060, 0.090, 0.012), 0.70, 0.0, 1.0),
    "soil":         ((0.040, 0.028, 0.018), 0.95, 0.0, 1.0),
    # pots
    "ceramic_white": ((0.800, 0.790, 0.760), 0.30, 0.0, 1.0),
    "concrete_light": ((0.480, 0.475, 0.455), 0.85, 0.0, 1.0),
    # accents
    "kraft":        ((0.550, 0.350, 0.170), 0.80, 0.0, 1.0),
    "cork":         ((0.480, 0.250, 0.090), 0.90, 0.0, 1.0),
    "red":          ((0.600, 0.030, 0.020), 0.50, 0.0, 1.0),
    "blue":         ((0.020, 0.120, 0.550), 0.50, 0.0, 1.0),
    "green":        ((0.080, 0.160, 0.040), 0.60, 0.0, 1.0),
    "yellow":       ((0.800, 0.500, 0.020), 0.50, 0.0, 1.0),
    "note_pink":    ((0.900, 0.300, 0.400), 0.70, 0.0, 1.0),
    "note_blue":    ((0.250, 0.550, 0.850), 0.70, 0.0, 1.0),
    "note_yellow":  ((0.950, 0.750, 0.150), 0.70, 0.0, 1.0),
    # acoustic felt and rugs (their own materials, so only they carry felt / pile texture)
    "felt_grey":    ((0.273, 0.266, 0.263), 0.95, 0.0, 1.0),
    "felt_light":   ((0.380, 0.372, 0.385), 0.95, 0.0, 1.0),
    "felt_dark":    ((0.045, 0.045, 0.047), 0.95, 0.0, 1.0),
    "rug_neutral":  ((0.380, 0.372, 0.385), 0.95, 0.0, 1.0),
    "rug_dark":     ((0.040, 0.040, 0.042), 0.95, 0.0, 1.0),
    "rug_pattern":  ((0.770, 0.740, 0.730), 0.95, 0.0, 1.0),
    # emissive: LED-lit interiors (drinks fridges on the Kitchenette board)
    "led_panel":    ((0.850, 0.880, 0.900), 0.50, 0.0, 1.0),
}
EMISSION = {"led_panel": 1.2}

# material: (detail texture from catalog/textures.py, metres one tile covers)
TEXTURES = {
    **{f: ("weave", 0.2) for f in ("fabric_dark", "fabric_cream", "fabric_grey", "fabric_sage", "fabric_rust")},
    **{f: ("felt", 0.35) for f in ("felt_grey", "felt_light", "felt_dark")},
    **{f: ("rug", 0.6) for f in ("rug_neutral", "rug_dark", "rug_pattern")},
    "oak": ("wood", 0.9), "oak_dark": ("wood", 0.9), "leather": ("leather", 0.3), "cork": ("cork", 0.3),
    "concrete": ("concrete", 0.8), "concrete_light": ("concrete", 0.8),
}
DETAIL_DIR = Path(__file__).resolve().parents[1] / "generated" / "textures"
DETAIL_MEAN = 0.75   # catalog/textures.py MEAN


def _tinted(name: str, rgb) -> bpy.types.Image:
    """The material's colour multiplied by its detail map, as an sRGB image packed into the GLB."""
    kind = TEXTURES[name][0]
    source = bpy.data.images.load(str(DETAIL_DIR / f"{kind}.png"), check_existing=True)
    size = source.size[0]
    grey = np.empty(size * size * 4, np.float32)
    source.pixels.foreach_get(grey)
    detail = grey.reshape(-1, 4)[:, :1] / DETAIL_MEAN          # PNG greyscale -> R = G = B
    linear = np.clip(np.asarray(rgb, np.float32)[None, :] * detail, 0.0, 1.0)
    srgb = np.where(linear <= 0.0031308, linear * 12.92, 1.055 * linear ** (1 / 2.4) - 0.055)
    image = bpy.data.images.new(f"VO_{name}", size, size, alpha=False)
    image.pixels.foreach_set(np.concatenate([srgb, np.ones((len(srgb), 1), np.float32)], axis=1).ravel())
    image.pack()
    return image


def mat(name: str) -> bpy.types.Material:
    """Shared material by palette name, created once per Blender session as VO_<name>."""
    key = f"VO_{name}"
    if key in bpy.data.materials:
        return bpy.data.materials[key]
    rgb, roughness, metallic, alpha = PALETTE[name]
    material = bpy.data.materials.new(key)
    material.use_nodes = True
    bsdf = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if name in TEXTURES:
        node = material.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = _tinted(name, rgb)
        material.node_tree.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    if name in EMISSION:
        bsdf.inputs["Emission Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Emission Strength"].default_value = EMISSION[name]
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        if hasattr(material, "surface_render_method"):
            material.surface_render_method = "BLENDED"
        material.use_backface_culling = False
    return material
