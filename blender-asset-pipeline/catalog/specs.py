"""Catalogue parts -> Blender build specs (label millimetres -> metres) with a stable hash."""

from __future__ import annotations

import hashlib
import json

PX_PER_M = 160  # every thumbnail shares this scale (see blender_kit/render.py)


def build_specs(catalogue: dict) -> list[dict]:
    specs = []
    for item in catalogue["items"]:
        if item["kind"] != "part":
            continue
        dims = item["dimsMm"] or {}
        spec = {
            "id": item["id"],
            "family": item["family"],
            "params": item["params"],
            "dims": {axis: (dims[axis] / 1000 if dims.get(axis) else None) for axis in "wdh"},
        }
        spec["hash"] = hashlib.sha256(json.dumps(spec, sort_keys=True).encode()).hexdigest()[:16]
        specs.append(spec)
    return specs
