"""Label -> object association on synthetic boards (board pixel coords)."""

import unittest

from catalog.associate import associate
from catalog.boxes import Box
from catalog.labels import LabelBlock, Section


def caption(name, x0, y0, w=80, section="SOFAS"):
    """A label printed under its object (object lies above)."""
    box = Box(x0, y0, x0 + w, y0 + 10)
    return LabelBlock(name=name, raw_name=name, box=box, name_box=box, dims=None,
                      placement="above", subtitle=None, section=section)


def title(name, x0, y0, w=140, bottom=None, section="SETUPS"):
    """A setup title printed over its object (object lies below)."""
    box = Box(x0, y0, x0 + w, bottom if bottom is not None else y0 + 28)
    return LabelBlock(name=name, raw_name=name, box=box, name_box=Box(x0, y0, x0 + w, y0 + 10),
                      dims=None, placement="below", subtitle="team setup", section=section)


SOFAS = Section("SOFAS", Box(20, 120, 80, 132))
SETUPS = Section("SETUPS", Box(20, 100, 90, 112))


def boxes(result):
    """name -> matched box (names are unique within these fixtures)."""
    return {block.name: match.box for block, match in result.items.items()}


class CaptionAssociationTest(unittest.TestCase):
    def test_each_label_takes_the_object_directly_above(self):
        labels = [caption("2 Seater Sofa", 60, 270), caption("3 Seater Sofa", 250, 270)]
        objects = [Box(30, 150, 170, 262), Box(205, 150, 370, 262)]
        result = associate(labels, [SOFAS], objects, board_size=(1536, 1024))
        self.assertEqual(boxes(result)["2 Seater Sofa"], Box(30, 150, 170, 262))
        self.assertEqual(boxes(result)["3 Seater Sofa"], Box(205, 150, 370, 262))
        self.assertEqual(result.unmatched, [])

    def test_object_spanning_two_labels_is_split_at_the_midpoint(self):
        # three touching rugs segment as one component
        labels = [caption("Rug (Neutral)", 725, 815, w=70), caption("Rug (Dark)", 849, 815, w=60),
                  caption("Rug (Pattern)", 984, 815, w=70)]
        merged = Box(705, 720, 1090, 805)
        result = associate(labels, [SOFAS], [merged], board_size=(1536, 1024))
        neutral, dark, pattern = (boxes(result)[n] for n in ("Rug (Neutral)", "Rug (Dark)", "Rug (Pattern)"))
        # label centres 760 / 879 / 1019 -> cuts at 819.5 and 949
        self.assertEqual((neutral.x0, dark.x0, pattern.x0), (705, 819.5, 949))
        self.assertEqual((neutral.x1, dark.x1, pattern.x1), (819.5, 949, 1090))

    def test_fragments_in_one_column_are_unioned(self):
        labels = [caption("Egg Chair", 498, 445, w=50)]
        fragments = [Box(480, 330, 560, 400), Box(500, 405, 545, 438)]  # shell + base
        result = associate(labels, [SOFAS], fragments, board_size=(1536, 1024))
        self.assertEqual(boxes(result)["Egg Chair"], Box(480, 330, 560, 438))

    def test_object_from_the_row_above_is_not_taken(self):
        upper = caption("Upper Item", 60, 270)
        lower = caption("Lower Item", 60, 445)
        objects = [Box(40, 150, 160, 262), Box(40, 300, 160, 437)]
        result = associate([upper, lower], [SOFAS], objects, board_size=(1536, 1024))
        self.assertEqual(boxes(result)["Lower Item"], Box(40, 300, 160, 437))

    def test_label_with_nothing_above_is_reported(self):
        labels = [caption("Ghost", 600, 270)]
        result = associate(labels, [SOFAS], [Box(30, 150, 170, 262)], board_size=(1536, 1024))
        self.assertNotIn("Ghost", boxes(result))
        self.assertEqual([b.name for b in result.unmatched], ["Ghost"])

    def test_label_inside_a_wide_merged_component_box_still_matches(self):
        # a row of desks merges into one wide component spanning both labels
        labels = [caption("Bench Desk (2)", 469, 600, w=70), caption("Bench Desk (4)", 724, 600, w=70)]
        row = Box(390, 450, 860, 598)
        result = associate(labels, [SOFAS], [row], board_size=(1536, 1024))
        self.assertEqual(boxes(result)["Bench Desk (2)"].x1, 631.5)
        self.assertEqual(boxes(result)["Bench Desk (4)"].x0, 631.5)

    def test_object_rising_above_its_section_header_is_still_taken(self):
        # a high-back sofa whose top pokes above the SOFAS header (y1 = 132)
        labels = [caption("High-Back Sofa", 1216, 270, w=75)]
        result = associate(labels, [SOFAS], [Box(1189, 118, 1329, 266)], board_size=(1536, 1024))
        self.assertEqual(boxes(result)["High-Back Sofa"], Box(1189, 118, 1329, 266))

    def test_unclaimed_large_objects_are_orphans(self):
        labels = [caption("2 Seater Sofa", 60, 270)]
        objects = [Box(30, 150, 170, 262), Box(700, 500, 900, 700)]
        result = associate(labels, [SOFAS], objects, board_size=(1536, 1024))
        self.assertEqual(result.orphans, [Box(700, 500, 900, 700)])


class TitledAssociationTest(unittest.TestCase):
    def test_titled_items_take_the_object_below_up_to_the_next_title(self):
        a = title("Compact Print Station", 66, 138)
        b = title("Standard Print Station", 304, 138)
        objects = [Box(30, 175, 240, 360), Box(260, 175, 500, 365)]
        result = associate([a, b], [SETUPS], objects, board_size=(1536, 1024))
        self.assertEqual(boxes(result)["Compact Print Station"], Box(30, 175, 240, 360))
        self.assertEqual(boxes(result)["Standard Print Station"], Box(260, 175, 500, 365))

    def test_touching_setups_are_cut_at_the_title_column_boundary(self):
        exec_desk = title("Executive Desk", 1138, 134)
        hot_desk = title("Hot Desk / Flex", 1364, 134)
        merged = Box(1090, 181, 1530, 411)
        result = associate([exec_desk, hot_desk], [SETUPS], [merged], board_size=(1536, 1024))
        self.assertEqual(boxes(result)["Executive Desk"], Box(1090, 181, 1344, 411))
        self.assertEqual(boxes(result)["Hot Desk / Flex"], Box(1344, 181, 1530, 411))

    def test_titled_item_may_overlap_its_title_and_trailing_dims(self):
        # plants poke above the title; the object runs a little past its dims line
        dims_box = Box(268, 378, 420, 387)
        t = LabelBlock(name="Multi-printer Setup", raw_name="MULTI-PRINTER SETUP", box=Box(304, 138, 430, 166),
                       name_box=Box(304, 138, 430, 148), dims=None, placement="below", subtitle="High usage area",
                       section="SETUPS", dims_box=dims_box)
        result = associate([t], [SETUPS], [Box(250, 130, 500, 389)], board_size=(1536, 1024))
        self.assertEqual(boxes(result)["Multi-printer Setup"], Box(250, 130, 500, 389))


if __name__ == "__main__":
    unittest.main()
