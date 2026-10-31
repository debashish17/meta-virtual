"""Blender entry point for one batch of build specs.

    blender --background --factory-startup --python blender_kit/entry.py -- <batch.json>

batch.json: {"specs": [{id, family, params, dims{w,d,h|null} (m), glb, thumb, pxPerM}], "results": path}
Writes one result per spec (measured size, triangle count, materials, thumbnail size) to
`results`; a failing spec records its traceback and the batch continues.
"""

import json
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from blender_kit import export, render  # noqa: E402
from blender_kit.families import FAMILIES  # noqa: E402
from blender_kit.families.common import Dims, seeded  # noqa: E402
from blender_kit.parts import new_root  # noqa: E402


def build_one(spec: dict) -> dict:
    export.clear_scene()
    root = new_root(spec["id"])
    target = FAMILIES[spec["family"]](Dims(**spec["dims"]), spec["params"], root, seeded(spec["id"]))
    obj = export.join(root, spec["id"])
    export.finalize(obj)
    result = {
        "id": spec["id"],
        "ok": True,
        "target": {k: round(v, 4) for k, v in zip("wdh", target)},
        "measured": export.measure(obj),
        "tris": export.triangles(obj),
        "materials": sorted(m.name for m in obj.data.materials),
    }
    for path in (spec["glb"], spec["thumb"]):
        os.makedirs(os.path.dirname(path), exist_ok=True)
    export.export_glb(obj, spec["glb"])
    result["thumb"] = render.render(obj, spec["thumb"], spec["pxPerM"])
    return result


def main() -> None:
    batch = json.load(open(sys.argv[sys.argv.index("--") + 1], encoding="utf-8"))
    results = []
    for spec in batch["specs"]:
        try:
            results.append(build_one(spec))
            print(f"KIT ok {spec['id']}", flush=True)
        except Exception:
            results.append({"id": spec["id"], "ok": False, "error": traceback.format_exc()[-1500:]})
            print(f"KIT FAILED {spec['id']}", flush=True)
    with open(batch["results"], "w", encoding="utf-8") as f:
        json.dump(results, f, indent=1)
    print("KIT_BATCH_DONE", flush=True)


main()
