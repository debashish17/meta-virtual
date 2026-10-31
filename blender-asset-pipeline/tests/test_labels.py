"""Label parsing: OCR words -> cells -> label blocks + section headers.

Fixtures mirror real OCR output from the reference boards (board pixel coords).
"""

import unittest

from catalog.boxes import Box
from catalog.labels import (
    Word,
    build_blocks,
    classify,
    parse_dims,
    repair_numeric,
    split_cell,
    split_line,
    title_case,
)


def word(text, x, y, w=None, h=10):
    return Word(text, Box(x, y, x + (w if w is not None else 6 * len(text)), y + h))


def line(*specs):
    """specs: (text, x) pairs on one baseline."""
    return [word(t, x, 100) for t, x in specs]


class SplitLineTest(unittest.TestCase):
    def test_keeps_one_label_together(self):
        cells = split_line(line(("Task", 22), ("Chair", 50), ("(Black)", 84)))
        self.assertEqual([c.text for c in cells], ["Task Chair (Black)"])

    def test_splits_at_wide_gaps(self):
        cells = split_line(line(("Small", 169), ("Plant", 205), ("Hanging", 260), ("Plant", 306)))
        self.assertEqual([c.text for c in cells], ["Small Plant", "Hanging Plant"])

    def test_dims_printed_on_the_name_line_are_split_off(self):
        cells = split_line(line(("Fabric", 10), ("BOX", 50), ("3SO", 72), ("x", 92), ("300", 100), ("x", 122), ("300", 130)))
        self.assertEqual([c.text for c in cells], ["Fabric BOX", "3SO x 300 x 300"])
        self.assertEqual(cells[1].box.x0, 72)

    def test_labelled_dims_line_is_not_split(self):
        cells = split_line(line(("Counter:", 10), ("1600", 62), ("x", 90), ("600", 98), ("x", 120), ("900", 128), ("mm", 150)))
        self.assertEqual([c.text for c in cells], ["Counter: 1600 x 600 x 900 mm"])

    def test_cell_box_is_union_of_words(self):
        (cell,) = split_line(line(("Egg", 10), ("Chair", 32)))
        self.assertEqual((cell.box.x0, cell.box.x1), (10, 62))

    def test_split_cell_by_word_counts(self):
        (cell,) = split_line(line(("Cable", 10), ("Grommet", 44), ("Power", 92), ("Module", 126), ("Cable", 168), ("Spine", 202)))
        parts = split_cell(cell, [2, 2, 2])
        self.assertEqual([p.text for p in parts], ["Cable Grommet", "Power Module", "Cable Spine"])
        self.assertEqual((parts[1].box.x0, parts[1].box.x1), (92, 162))

    def test_split_cell_rejects_wrong_counts(self):
        (cell,) = split_line(line(("Egg", 10), ("Chair", 32)))
        self.assertIsNone(split_cell(cell, [1, 2]))


class DimsTest(unittest.TestCase):
    def test_repairs_ocr_digit_confusions(self):
        self.assertEqual(repair_numeric("2000 x SOO mm"), "2000 x 500 mm")
        self.assertEqual(repair_numeric("3SOx2SOxSOOmm"), "350x250x500mm")
        self.assertEqual(repair_numeric("700XSOOX 1000 mm"), "700x500x 1000 mm")
        self.assertEqual(repair_numeric("400x400x'800mm"), "400x400x800mm")

    def test_repair_leaves_words_alone(self):
        self.assertEqual(repair_numeric("Solid Door"), "Solid Door")

    def test_three_values(self):
        d = parse_dims("1600 x 1400 x 750 mm")
        self.assertEqual(d.values_mm, (1600, 1400, 750))
        self.assertFalse(d.diameter)

    def test_diameter(self):
        d = parse_dims("Dia 700 mm")
        self.assertEqual(d.values_mm, (700,))
        self.assertTrue(d.diameter)

    def test_metres_are_converted(self):
        self.assertEqual(parse_dims("2 x 3 m").values_mm, (2000, 3000))

    def test_range_takes_lower_bound(self):
        d = parse_dims("1400 x 700 x 750-1200 mm")
        self.assertEqual(d.values_mm, (1400, 700, 750))
        self.assertEqual(d.range_mm, (750, 1200))

    def test_prefixed_counter_dims(self):
        self.assertEqual(parse_dims("Counter: 1600 x 600 x 900 mm").values_mm, (1600, 600, 900))

    def test_single_width(self):
        self.assertEqual(parse_dims("600 mm").values_mm, (600,))

    def test_unitless_needs_two_values(self):
        self.assertEqual(parse_dims("300 x 200 x 200").values_mm, (300, 200, 200))
        self.assertIsNone(parse_dims("Small Locker (2x2)"))
        self.assertIsNone(parse_dims("Model 300"))

    def test_height_only(self):
        d = parse_dims("Height: ISOO mm")
        self.assertEqual((d.values_mm, d.axis), ((1500,), "h"))

    def test_axis_word_only_applies_directly_before_the_value(self):
        self.assertIsNone(parse_dims("Counter: 1600 x 600 x 900 mm").axis)
        self.assertEqual(parse_dims("Width 600 mm").axis, "w")

    def test_rejects_plain_names(self):
        self.assertIsNone(parse_dims("Round Coffee Table"))
        self.assertIsNone(parse_dims("A3 MFP (Large)"))


class ClassifyTest(unittest.TestCase):
    def test_kinds(self):
        self.assertEqual(classify("COFFEE TABLES"), "header")
        self.assertEqual(classify("IT & SERVER / NETWORK EQUIPIMENT"), "header")
        self.assertEqual(classify("Dia 400 mm"), "dims")
        self.assertEqual(classify("1000"), "dims")
        self.assertEqual(classify("x 1800 mm"), "dims")
        self.assertEqual(classify("AED (Defibrillator)"), "name")
        self.assertEqual(classify("UPS Unit"), "name")
        self.assertEqual(classify("HDMI / USB-C Hub"), "name")
        self.assertEqual(classify("PLANTS (DESK)"), "header")
        self.assertEqual(classify("09"), "noise")
        self.assertEqual(classify("l:"), "noise")

    def test_title_case(self):
        self.assertEqual(title_case("BENCHING (2 SEATER)"), "Benching (2 Seater)")
        self.assertEqual(title_case("PRINT + SUPPLY ISLAND"), "Print + Supply Island")


class BuildBlocksTest(unittest.TestCase):
    def test_caption_below_with_dims_and_section(self):
        cells = [
            *split_line([word("COFFEE", 945, 308), word("TABLES", 995, 308)]),
            *split_line([word("Round", 949, 445), word("Coffee", 985, 445), word("Table", 1025, 445)]),
            *split_line([word("Dia", 949, 459), word("700", 970, 459), word("mm", 992, 459)]),
        ]
        sections, blocks = build_blocks(cells)
        self.assertEqual([s.text for s in sections], ["COFFEE TABLES"])
        (b,) = blocks
        self.assertEqual(b.name, "Round Coffee Table")
        self.assertEqual(b.dims.values_mm, (700,))
        self.assertEqual(b.placement, "above")
        self.assertEqual(b.section, "COFFEE TABLES")

    def test_continuation_line_is_merged(self):
        cells = [
            *split_line([word("Fabric", 580, 821), word("Divider", 618, 821)]),
            *split_line([word("(Light)", 580, 834)]),
        ]
        _, (b,) = build_blocks(cells)
        self.assertEqual(b.name, "Fabric Divider (Light)")

    def test_split_dims_fragments_are_joined(self):
        cells = [
            *split_line([word("Bookshelf", 689, 979)]),
            *split_line([word("1000", 689, 994)]),
            *split_line([word("x", 739, 994), word("1800", 748, 994), word("mm", 776, 994)]),
        ]
        _, (b,) = build_blocks(cells)
        self.assertEqual(b.dims.values_mm, (1000, 1800))

    def test_titled_item_with_subtitle_and_trailing_dims(self):
        cells = [
            *split_line([word("PRINT", 24, 114), word("STATION", 60, 114), word("SETUPS", 110, 114)]),
            *split_line([word("COMPACT", 66, 138), word("PRINT", 116, 138), word("STATION", 150, 138)]),
            *split_line([word("Small", 66, 155), word("team", 100, 155), word("setup", 130, 155)]),
            *split_line([word("Printer", 29, 376), word("counter:", 72, 376), word("1200", 125, 376),
                         word("x", 155, 376), word("500", 163, 376), word("x", 185, 376),
                         word("900", 193, 376), word("mm", 215, 376)]),
        ]
        sections, (b,) = build_blocks(cells)
        self.assertEqual([s.text for s in sections], ["PRINT STATION SETUPS"])
        self.assertEqual(b.name, "Compact Print Station")
        self.assertEqual(b.subtitle, "Small team setup")
        self.assertEqual(b.placement, "below")
        self.assertEqual(b.dims.values_mm, (1200, 500, 900))
        self.assertEqual(b.section, "PRINT STATION SETUPS")

    def test_section_is_nearest_header_to_the_left_on_the_same_band(self):
        cells = [
            *split_line([word("COLLABORATION", 25, 501), word("SEATING", 110, 501)]),
            *split_line([word("PHONE", 860, 501), word("BOOTHS", 900, 501)]),
            *split_line([word("Double", 1029, 662), word("Focus", 1070, 662), word("Pod", 1105, 662)]),
            *split_line([word("Open", 87, 659), word("Lounge", 115, 659), word("Set", 158, 659)]),
        ]
        _, blocks = build_blocks(cells)
        by_name = {b.name: b.section for b in blocks}
        self.assertEqual(by_name["Double Focus Pod"], "PHONE BOOTHS")
        self.assertEqual(by_name["Open Lounge Set"], "COLLABORATION SEATING")


if __name__ == "__main__":
    unittest.main()
