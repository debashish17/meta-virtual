"""Build specs, QA verdicts and review staleness. QA must be able to fail."""

import tempfile
import unittest
from pathlib import Path

from catalog.catalogue import Family
from catalog.qa import evaluate, geometry_hash, measure_glb, review_status
from catalog.specs import build_specs

SOFA = Family("sofa", "lounge", "part", "wdh")
PLANTER = Family("planter", "greenery", "part", "wdh", qa_h="min")
SPILLING = Family("planter", "greenery", "part", "wdh", qa_h="min", qa_wd="min")


def item(dims_mm=None, family="sofa"):
    return {"id": "lounge.2-seater-sofa", "kind": "part", "family": family, "params": {"seats": 2}, "dimsMm": dims_mm}


def result(target=(1.6, 0.85, 0.8), tris=1200, ok=True):
    return {"id": "lounge.2-seater-sofa", "ok": ok, "target": dict(zip("wdh", target)), "tris": tris,
            "error": None if ok else "Traceback: boom"}


def glb(size=(1.6, 0.85, 0.8), min_y=0.0, centre=(0.0, 0.0), nbytes=80_000, materials=3):
    return {"size": dict(zip("wdh", size)), "minY": min_y, "centre": centre, "bytes": nbytes, "materials": materials}


def statuses(report):
    return {c["name"]: c["status"] for c in report["checks"]}


class SpecsTest(unittest.TestCase):
    def test_parts_become_specs_in_metres(self):
        catalogue = {"items": [item({"w": 1600, "d": 850, "h": None}),
                               {"id": "decor.mug", "kind": "reference", "family": None, "params": {}, "dimsMm": None}]}
        (spec,) = build_specs(catalogue)
        self.assertEqual(spec["dims"], {"w": 1.6, "d": 0.85, "h": None})
        self.assertEqual(len(spec["hash"]), 16)

    def test_hash_changes_with_params_or_dims(self):
        a = build_specs({"items": [item({"w": 1600, "d": 850, "h": 800})]})[0]["hash"]
        b = build_specs({"items": [item({"w": 1700, "d": 850, "h": 800})]})[0]["hash"]
        self.assertNotEqual(a, b)


class EvaluateTest(unittest.TestCase):
    def test_matching_label_passes(self):
        report = evaluate(item({"w": 1600, "d": 850, "h": 800}), SOFA, result(), glb())
        self.assertEqual(report["verdict"], "pass")

    def test_label_mismatch_fails(self):
        report = evaluate(item({"w": 2000, "d": 850, "h": 800}), SOFA, result(), glb())
        self.assertEqual((report["verdict"], statuses(report)["label_size"]), ("fail", "fail"))

    def test_small_deviation_within_tolerance_passes(self):
        report = evaluate(item({"w": 1600, "d": 850, "h": 800}), SOFA, result(), glb(size=(1.615, 0.86, 0.79)))
        self.assertEqual(report["verdict"], "pass")

    def test_no_printed_size_is_unchecked_not_pass(self):
        report = evaluate(item(None), SOFA, result(), glb())
        self.assertEqual((report["verdict"], statuses(report)["label_size"]), ("unchecked", "unchecked"))

    def test_min_height_mode_allows_foliage_above_the_box(self):
        report = evaluate(item({"w": 1600, "d": 850, "h": 800}, "planter"), PLANTER, result(target=(1.6, 0.85, 1.1)),
                          glb(size=(1.6, 0.85, 1.1)))
        self.assertEqual(report["verdict"], "pass")
        short = evaluate(item({"w": 1600, "d": 850, "h": 800}, "planter"), PLANTER, result(target=(1.6, 0.85, 0.5)),
                         glb(size=(1.6, 0.85, 0.5)))
        self.assertEqual(short["verdict"], "fail")

    def test_min_height_mode_also_applies_to_the_builder_target(self):
        # the builder targets the rigid box height; foliage above it is fine, falling short is not
        tall = evaluate(item({"w": 1600, "d": 850, "h": 800}, "planter"), PLANTER, result(target=(1.6, 0.85, 0.8)),
                        glb(size=(1.6, 0.85, 1.1)))
        self.assertEqual(statuses(tall)["target_size"], "pass")
        short = evaluate(item(None, "planter"), PLANTER, result(target=(1.6, 0.85, 0.8)), glb(size=(1.6, 0.85, 0.6)))
        self.assertEqual(statuses(short)["target_size"], "fail")

    def test_min_footprint_mode_allows_greenery_over_the_edges_but_not_a_smaller_box(self):
        spill = evaluate(item({"w": 1200, "d": 300, "h": 300}, "planter"), SPILLING, result(target=(1.2, 0.3, 0.3)),
                         glb(size=(1.3, 0.4, 0.7)))
        self.assertEqual((statuses(spill)["label_size"], statuses(spill)["target_size"]), ("pass", "pass"))
        narrow = evaluate(item({"w": 1200, "d": 300, "h": 300}, "planter"), SPILLING, result(target=(1.2, 0.3, 0.3)),
                          glb(size=(1.0, 0.3, 0.7)))
        self.assertEqual((statuses(narrow)["label_size"], statuses(narrow)["target_size"]), ("fail", "fail"))
        strict = evaluate(item({"w": 1200, "d": 300, "h": 300}, "planter"), PLANTER, result(target=(1.2, 0.3, 0.3)),
                          glb(size=(1.3, 0.4, 0.7)))
        self.assertEqual(statuses(strict)["label_size"], "fail")

    def test_builder_missing_its_own_target_fails(self):
        report = evaluate(item(None), SOFA, result(target=(1.6, 0.85, 0.8)), glb(size=(1.9, 0.85, 0.8)))
        self.assertEqual(statuses(report)["target_size"], "fail")

    def test_budgets_origin_and_materials(self):
        self.assertEqual(statuses(evaluate(item(None), SOFA, result(tris=12000), glb()))["tris"], "fail")
        self.assertEqual(statuses(evaluate(item(None), SOFA, result(), glb(nbytes=1_500_000)))["glb_size"], "fail")
        self.assertEqual(statuses(evaluate(item(None), SOFA, result(), glb(min_y=0.03)))["origin"], "fail")
        self.assertEqual(statuses(evaluate(item(None), SOFA, result(), glb(centre=(0.1, 0.0))))["origin"], "fail")
        self.assertEqual(statuses(evaluate(item(None), SOFA, result(), glb(materials=0)))["materials"], "fail")

    def test_failed_build_fails(self):
        report = evaluate(item(None), SOFA, result(ok=False), None)
        self.assertEqual((report["verdict"], statuses(report)["build"]), ("fail", "fail"))


class MeasureGlbTest(unittest.TestCase):
    def test_reads_gltf_axes_as_width_depth_height(self):
        import trimesh

        box = trimesh.creation.box(extents=(1.0, 0.5, 0.2))  # glTF: x = width, y = up, z = depth
        box.apply_translation((0.0, 0.25, 0.0))
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "box.glb"
            box.export(path)
            m = measure_glb(path)
        self.assertEqual({k: round(v, 3) for k, v in m["size"].items()}, {"w": 1.0, "d": 0.2, "h": 0.5})
        self.assertAlmostEqual(m["minY"], 0.0, places=4)


class GeometryHashTest(unittest.TestCase):
    def _export(self, mesh, tmp, name):
        path = Path(tmp) / name
        mesh.export(path)
        return path

    def test_same_shape_in_a_different_vertex_order_hashes_the_same(self):
        import numpy as np
        import trimesh

        box = trimesh.creation.box(extents=(1.0, 0.5, 0.2))
        order = np.random.default_rng(1).permutation(len(box.vertices))
        inverse = np.argsort(order)
        shuffled = trimesh.Trimesh(box.vertices[order], inverse[box.faces][::-1], process=False)
        moved = box.copy()
        moved.apply_translation((0.0, 0.01, 0.0))
        with tempfile.TemporaryDirectory() as tmp:
            a = geometry_hash(self._export(box, tmp, "a.glb"))
            b = geometry_hash(self._export(shuffled, tmp, "b.glb"))
            c = geometry_hash(self._export(moved, tmp, "c.glb"))
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)


class ReviewStatusTest(unittest.TestCase):
    def test_statuses(self):
        reviews = {"a.x": {"decision": "approved", "specHash": "h1", "buildHash": "g1"},
                   "a.y": {"decision": "rejected", "specHash": "h2", "buildHash": "g2"}}
        self.assertEqual(review_status("a.x", "h1", "g1", reviews), "approved")
        self.assertEqual(review_status("a.x", "h9", "g1", reviews), "stale")
        self.assertEqual(review_status("a.y", "h2", "g2", reviews), "rejected")
        self.assertEqual(review_status("a.z", "h3", "g3", reviews), "pending")

    def test_changed_geometry_makes_a_decision_stale(self):
        reviews = {"a.x": {"decision": "approved", "specHash": "h1", "buildHash": "g1"}}
        self.assertEqual(review_status("a.x", "h1", "g2", reviews), "stale")

    def test_decisions_without_build_hash_use_the_baseline(self):
        # decisions exported from a page generated before build hashes existed
        reviews = {"a.x": {"decision": "approved", "specHash": "h1"}}
        self.assertEqual(review_status("a.x", "h1", "g1", reviews, baseline={"a.x": "g1"}), "approved")
        self.assertEqual(review_status("a.x", "h1", "g2", reviews, baseline={"a.x": "g1"}), "stale")
        self.assertEqual(review_status("a.x", "h1", "g1", reviews), "stale")


if __name__ == "__main__":
    unittest.main()
