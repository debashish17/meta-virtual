"""Blender-side asset kit: runs inside Blender's bundled Python (bpy available).

entry.py reads build specs written by ../catalog/specs.py and, for each catalogue part, runs its
family builder (families/), normalises the mesh, exports a GLB and renders a fixed-scale
isometric thumbnail. No board, OCR or catalogue logic lives here.
"""
