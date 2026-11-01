"""Honest QA for built assets: every check can fail, and nothing is scored by assumption.

Sizes are measured from the exported GLB with trimesh (independent of Blender's own report)
and compared with the size printed on the board label and with the builder's target.
A part with no printed size is "unchecked", never "pass".
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from .catalogue import Family

REL_TOLERANCE, ABS_TOLERANCE = 0.05, 0.02   # per axis: within 5% or 20 mm, whichever is larger
MAX_GLB_BYTES = 1_000_000
ORIGIN_TOLERANCE = 0.005                    # m: floor at y=0, footprint centred on x/z


def _within(measured: float, expected: float, mode: str = "exact") -> bool:
    tol = max(REL_TOLERANCE * expected, ABS_TOLERANCE)
    return measured >= expected - tol if mode == "min" else abs(measured - expected) <= tol


def _mode(family: Family, axis: str) -> str:
    return family.qa_h if axis == "h" else family.qa_wd


def _check(name: str, ok: bool | None, detail: str) -> dict:
    return {"name": name, "status": "unchecked" if ok is None else ("pass" if ok else "fail"), "detail": detail}


def evaluate(item: dict, family: Family, result: dict, glb: dict | None) -> dict:
    if not result.get("ok") or glb is None:
        return {"verdict": "fail", "checks": [_check("build", False, (result.get("error") or "no GLB")[-600:])]}
    size = glb["size"]
    checks = []

    label = {a: v / 1000 for a, v in (item["dimsMm"] or {}).items() if v}
    if label:
        parts, ok = [], True
        for axis, expected in label.items():
            mode = _mode(family, axis)
            good = _within(size[axis], expected, mode)
            ok &= good
            parts.append(f"{axis} {size[axis]:.3f}{' >=' if mode == 'min' else ' vs'} {expected:.3f}{'' if good else ' ✗'}")
        source = "hand-corrected label" if item.get("dimsOrigin") == "correction" else "printed label"
        checks.append(_check("label_size", ok, "; ".join(parts) + f" (m, {source})"))
    else:
        checks.append(_check("label_size", None, "no size printed on the board"))

    target = result["target"]
    off = [f"{a} {size[a]:.3f} vs {target[a]:.3f}" for a in "wdh"
           if not _within(size[a], target[a], _mode(family, a))]
    checks.append(_check("target_size", not off, "; ".join(off) or "matches builder target"))
    checks.append(_check("tris", result["tris"] <= family.tris, f"{result['tris']} / {family.tris}"))
    checks.append(_check("glb_size", glb["bytes"] <= MAX_GLB_BYTES, f"{glb['bytes'] / 1024:.0f} KB"))
    cx, cz = glb["centre"]
    origin_ok = abs(glb["minY"]) <= ORIGIN_TOLERANCE and abs(cx) <= ORIGIN_TOLERANCE and abs(cz) <= ORIGIN_TOLERANCE
    checks.append(_check("origin", origin_ok, f"floor {glb['minY']:+.3f}, centre ({cx:+.3f}, {cz:+.3f})"))
    checks.append(_check("materials", glb["materials"] >= 1, f"{glb['materials']} materials"))

    statuses = {c["status"] for c in checks}
    verdict = "fail" if "fail" in statuses else ("unchecked" if "unchecked" in statuses else "pass")
    return {"verdict": verdict, "checks": checks}


def measure_glb(path: Path) -> dict:
    """Bounds of a GLB in app terms: glTF x = width, y = height (up), z = depth."""
    import trimesh

    scene = trimesh.load(str(path), force="scene")
    lo, hi = scene.bounds
    materials = {id(g.visual.material) for g in scene.geometry.values() if hasattr(g.visual, "material")}
    return {
        "size": {"w": float(hi[0] - lo[0]), "d": float(hi[2] - lo[2]), "h": float(hi[1] - lo[1])},
        "minY": float(lo[1]),
        "centre": (float((lo[0] + hi[0]) / 2), float((lo[2] + hi[2]) / 2)),
        "bytes": Path(path).stat().st_size,
        "materials": len(materials),
    }


def geometry_hash(path: Path) -> str:
    """Hash of what a GLB looks like, independent of vertex and face order: per material (its name,
    colour factor and texture pixels), the sorted set of triangles with corners rounded to 0.01 mm.
    Byte hashes are unusable because Blender's export order varies with session state while the
    result is identical."""
    import numpy as np
    import trimesh

    digest = hashlib.sha256()
    scene = trimesh.load(str(path), force="scene")
    meshes = []
    for node in scene.graph.nodes_geometry:
        transform, name = scene.graph[node]
        mesh = scene.geometry[name]
        tris = np.round(trimesh.transform_points(mesh.vertices, transform)[mesh.faces] * 1e5).astype(np.int64)
        tris = np.sort(tris.view([("", np.int64)] * 3).reshape(len(tris), 3), axis=1).view(np.int64).reshape(-1, 9)
        tris = tris[np.lexsort(tris.T[::-1])]
        pbr = getattr(mesh.visual, "material", None)
        material = (getattr(pbr, "name", "") or "").encode()
        factor = getattr(pbr, "baseColorFactor", None)
        if factor is not None:
            material += np.round(np.asarray(factor, np.float64), 4).tobytes()
        texture = getattr(pbr, "baseColorTexture", None)
        if texture is not None:
            material += hashlib.sha256(np.asarray(texture).tobytes()).digest()
        meshes.append((material, tris.tobytes()))
    for material, data in sorted(meshes):
        digest.update(material)
        digest.update(data)
    return digest.hexdigest()[:16]


def review_status(item_id: str, spec_hash: str, build_hash: str, reviews: dict, baseline: dict | None = None) -> str:
    """approved / rejected from data/reviews.json, or "stale" once the spec or the built GLB
    changed since the decision. `build_hash` is geometry_hash() of the GLB, so refactors that
    leave the geometry identical keep their approvals. Decisions exported before build hashes existed are
    compared against `baseline` (GLB hashes snapshotted when that page was generated)."""
    entry = reviews.get(item_id)
    if not entry:
        return "pending"
    reviewed_build = entry.get("buildHash") or (baseline or {}).get(item_id)
    if entry.get("specHash") != spec_hash or reviewed_build != build_hash:
        return "stale"
    return entry["decision"]
