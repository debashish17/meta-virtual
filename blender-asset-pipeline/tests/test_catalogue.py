"""Catalogue assembly: corrections, family rules, ids and cross-board dedupe."""

import unittest

from catalog.catalogue import Corrections, FamilyRules, build_catalogue, slugify
from catalog.labels import Dims


def occurrence(name, board="Office Lounge Seating Reference Board.png", section="SOFAS", dims=None, raw=None,
               origin="board", dims_origin=None):
    return {
        "name": name,
        "raw_name": raw or name,
        "board": board,
        "section": section,
        "dims": dims,
        "dims_text": None,
        "dims_origin": dims_origin or ("label" if dims else None),
        "placement": "above",
        "subtitle": None,
        "label_box": [0, 0, 10, 10],
        "item_box": [0, 0, 10, 10],
        "crop": None,
        "origin": origin,
    }


RULES = FamilyRules.from_dict({
    "families": {
        "sofa": {"category": "lounge", "kind": "part", "dims": "wdh"},
        "rug": {"category": "lounge", "kind": "part", "dims": "wd"},
        "door": {"category": "architecture", "kind": "part", "dims": "wh"},
        "partition": {"category": "partition", "kind": "part", "dims": "wh_max"},
        "lamp": {"category": "lighting", "kind": "part", "dims": "h", "tris": 2000, "qa_h": "min"},
    },
    "rule": [
        {"match": r"\bset$|\bsetup\b", "kind": "composite"},
        {"match": r"sofa", "family": "sofa", "params": {"seats": 2}},
        {"match": r"^rug\b", "family": "rug"},
        {"match": r"door", "family": "door"},
        {"match": r"^hanging panel$", "family": "partition", "dims": "whd"},
        {"match": r"glass wall|panel", "family": "partition"},
        {"match": r"lamp|light", "family": "lamp"},
        {"match": r"^tall rug$", "family": "rug", "dims": "wh"},
    ],
    "sections": {r"accessories": "decor"},
    "boards": {"Office Lounge Seating Reference Board.png": "lounge"},
})


class SlugTest(unittest.TestCase):
    def test_slugify(self):
        self.assertEqual(slugify("L-Shaped Sofa (Left)"), "l-shaped-sofa-left")
        self.assertEqual(slugify("Sofa + Chair Set"), "sofa-plus-chair-set")
        self.assertEqual(slugify("Mop & Bucket"), "mop-and-bucket")


class CorrectionsTest(unittest.TestCase):
    def test_name_and_dims_fixes(self):
        c = Corrections.from_dict({"names": {"Modem Armchair": "Modern Armchair"},
                                   "dims": {"2000 x goo x goo mm": "2000 x 900 x 900 mm"}})
        self.assertEqual(c.name("modem armchair"), "Modern Armchair")
        self.assertEqual(c.name("Egg Chair"), "Egg Chair")
        self.assertEqual(c.dims("2000 x goo x goo mm"), "2000 x 900 x 900 mm")

    def test_board_specific_names_win_over_global(self):
        c = Corrections.from_dict({"names": {"Reader": "Card Reader",
                                             "Doors.png": {"Scanner": "Biometric Scanner"}}})
        self.assertEqual(c.name("Scanner", "Doors.png"), "Biometric Scanner")
        self.assertEqual(c.name("Scanner", "Print.png"), "Scanner")
        self.assertEqual(c.name("Reader", "Doors.png"), "Card Reader")

    def test_item_dims_fill_in_unreadable_dims(self):
        c = Corrections.from_dict({"item_dims": {"Hanging Planter": "300 x 300 x 400 mm"}})
        self.assertEqual(c.item_dims("hanging planter"), "300 x 300 x 400 mm")
        self.assertIsNone(c.item_dims("Egg Chair"))

    def test_unused_corrections_are_reported(self):
        c = Corrections.from_dict({"names": {"Modem Armchair": "Modern Armchair", "Never Seen": "X"},
                                   "dims": {"SOO mm": "500 mm"}, "item_dims": {"Shelf": "800 mm"},
                                   "split": [{"board": "B.png", "text": "A B", "words": [1, 1]}],
                                   "drop": [{"board": "*", "text": "Island."}]})
        c.name("modem armchair")
        c.dims("SOO mm")
        c.dropped("B.png", "Island.")
        self.assertEqual(sorted(c.unused()), ["[[split]] B.png: 'a b'", "[item_dims] 'shelf'", "[names] 'never seen'"])

    def test_missed_text_becomes_one_line_of_words_across_its_box(self):
        c = Corrections.from_dict({"text": [{"board": "P.png", "text": "PRIVACY SCREENS", "box": [100, 50, 250, 62]}]})
        self.assertEqual(c.missed_text("Other.png"), [])
        self.assertEqual(c.unused(), ["[[text]] P.png: 'privacy screens'"])
        [line] = c.missed_text("P.png")
        self.assertEqual([w.text for w in line], ["PRIVACY", "SCREENS"])
        self.assertEqual((line[0].box.x0, line[-1].box.x1, line[0].box.y0, line[0].box.y1), (100, 250, 50, 62))
        self.assertLess(line[0].box.x1, line[1].box.x0)
        self.assertEqual(c.unused(), [])

    def test_split_rule_lookup(self):
        c = Corrections.from_dict({"split": [{"board": "Board.png", "text": "Snack Jar Sugar Jar", "words": [2, 2]}]})
        self.assertEqual(c.split("Board.png", "snack jar sugar jar"), [2, 2])
        self.assertIsNone(c.split("Other.png", "Snack Jar Sugar Jar"))

    def test_drop(self):
        c = Corrections.from_dict({"drop": [{"board": "*", "text": "Desk Variations (Top View)"}]})
        self.assertTrue(c.dropped("Any Board.png", "desk variations (top view)"))
        self.assertFalse(c.dropped("Any Board.png", "Standard Desk"))


class BuildCatalogueTest(unittest.TestCase):
    def build(self, occs):
        return build_catalogue(occs, RULES)

    def test_family_and_kind(self):
        (item,) = self.build([occurrence("2 Seater Sofa", dims=Dims((1600, 850, 800), False, "x"))])
        self.assertEqual(item["id"], "lounge.2-seater-sofa")
        self.assertEqual((item["kind"], item["family"], item["params"]), ("part", "sofa", {"seats": 2}))
        self.assertEqual(item["dimsMm"], {"w": 1600, "d": 850, "h": 800})

    def test_family_dims_order(self):
        (rug,) = self.build([occurrence("Rug (Dark)", dims=Dims((2000, 3000), False, "x"))])
        self.assertEqual(rug["dimsMm"], {"w": 2000, "d": 3000, "h": None})
        (door,) = self.build([occurrence("Solid Door", dims=Dims((900, 2400), False, "x"))])
        self.assertEqual(door["dimsMm"], {"w": 900, "d": None, "h": 2400})

    def test_wh_max_puts_the_larger_value_on_height(self):
        # boards print partitions as "2400 x 1200" and wall panels as "1000 x 2700"
        (a,) = self.build([occurrence("Full Glass Wall", dims=Dims((2400, 1200), False, "x"))])
        (b,) = self.build([occurrence("Glass Wall Panel", dims=Dims((1000, 2700), False, "x"))])
        self.assertEqual(a["dimsMm"], {"w": 1200, "d": None, "h": 2400})
        self.assertEqual(b["dimsMm"], {"w": 1000, "d": None, "h": 2700})

    def test_rule_can_override_the_family_dims_order(self):
        (item,) = self.build([occurrence("Tall Rug", dims=Dims((1000, 1800), False, "x"))])
        self.assertEqual(item["dimsMm"], {"w": 1000, "d": None, "h": 1800})

    def test_three_letter_order_remaps_three_values(self):
        # "Hanging Acoustic Panel 1200 x 600 x 50 mm" is width x height x thickness
        (item,) = self.build([occurrence("Hanging Panel", dims=Dims((1200, 600, 50), False, "x"))])
        self.assertEqual(item["dimsMm"], {"w": 1200, "d": 50, "h": 600})

    def test_family_settings(self):
        self.assertEqual((RULES.families["lamp"].tris, RULES.families["lamp"].qa_h), (2000, "min"))
        self.assertEqual((RULES.families["sofa"].tris, RULES.families["sofa"].qa_h), (10000, "exact"))

    def test_height_only_family(self):
        (lamp,) = self.build([occurrence("Floor Lamp", dims=Dims((1500,), False, "x"))])
        self.assertEqual(lamp["dimsMm"], {"w": None, "d": None, "h": 1500})

    def test_diameter_fills_width_and_depth(self):
        (rug,) = self.build([occurrence("Rug (Round)", dims=Dims((2000,), True, "x"))])
        self.assertEqual(rug["dimsMm"], {"w": 2000, "d": 2000, "h": None})

    def test_composite_rule_wins_over_family(self):
        (item,) = self.build([occurrence("Sofa + Chair Set", section="COLLABORATION SEATING")])
        self.assertEqual((item["kind"], item["family"]), ("composite", None))

    def test_unmatched_is_reference_with_section_category(self):
        (item,) = self.build([occurrence("Throw Blanket", section="LOUNGE ACCESSORIES")])
        self.assertEqual((item["kind"], item["category"]), ("reference", "decor"))
        self.assertEqual(item["id"], "decor.throw-blanket")

    def test_same_name_across_boards_merges_sources(self):
        items = self.build([occurrence("Rug (Dark)"),
                            occurrence("Rug (Dark)", board="Modern Office Asset Library Board.png")])
        (item,) = items
        self.assertEqual(len(item["sources"]), 2)

    def test_same_name_different_dims_stays_separate(self):
        items = self.build([occurrence("Rug (Dark)", dims=Dims((2000, 3000), False, "x")),
                            occurrence("Rug (Dark)", dims=Dims((1200, 1800), False, "x"),
                                       board="Modern Office Asset Library Board.png")])
        self.assertEqual(sorted(i["id"] for i in items),
                         ["lounge.rug-dark-1200x1800", "lounge.rug-dark-2000x3000"])

    def test_ids_are_unique_and_sorted_stably(self):
        occs = [occurrence(n) for n in ("Bench Sofa", "2 Seater Sofa", "High-Back Sofa")]
        first = [i["id"] for i in self.build(occs)]
        second = [i["id"] for i in self.build(list(reversed(occs)))]
        self.assertEqual(first, second)
        self.assertEqual(len(set(first)), 3)

    def test_provenance_is_kept(self):
        (hand,) = self.build([occurrence("Desk Lamp", origin="hand")])
        self.assertEqual(hand["sources"][0]["origin"], "hand")
        self.assertIsNone(hand["dimsOrigin"])
        (fixed,) = self.build([occurrence("2 Seater Sofa", dims=Dims((1600, 850, 800), False, "x"),
                                          dims_origin="correction")])
        self.assertEqual(fixed["dimsOrigin"], "correction")
        (read,) = self.build([occurrence("Bench Sofa", dims=Dims((2000, 800, 750), False, "x"))])
        self.assertEqual((read["dimsOrigin"], read["sources"][0]["origin"]), ("label", "board"))

    def test_axis_word_places_a_single_value(self):
        (lamp,) = self.build([occurrence("Floor Lamp", dims=Dims((700,), False, "Height: 700 mm", axis="h"))])
        self.assertEqual(lamp["dimsMm"], {"w": None, "d": None, "h": 700})
        (sofa,) = self.build([occurrence("Bench Sofa", dims=Dims((700,), False, "Height: 700 mm", axis="h"))])
        self.assertEqual(sofa["dimsMm"], {"w": None, "d": None, "h": 700})

    def test_raw_label_is_kept_when_corrected(self):
        (item,) = self.build([occurrence("Modern Armchair", raw="Modem Armchair")])
        self.assertEqual(item["sources"][0]["rawLabel"], "Modem Armchair")


if __name__ == "__main__":
    unittest.main()
