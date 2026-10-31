"""Pixel-level helpers: telling text printed on an object from a label on the background."""

import unittest

import numpy as np

from catalog.boxes import Box
from catalog.labels import Cell
from catalog.segment import FOREGROUND, split_art_text


class ArtTextTest(unittest.TestCase):
    def setUp(self):
        self.distance = np.zeros((200, 300), np.float32)
        self.distance[20:120, 150:290] = FOREGROUND + 40  # a dark menu board

    def test_text_on_an_object_is_art(self):
        on_board = Cell("Espresso", Box(170, 50, 220, 60))
        label = Cell("Coffee Bar", Box(160, 150, 230, 160))  # under the board, on background
        labels, art = split_art_text([on_board, label], self.distance)
        self.assertEqual([c.text for c in labels], ["Coffee Bar"])
        self.assertEqual([c.text for c in art], ["Espresso"])

    def test_label_touching_an_object_edge_is_kept(self):
        # a caption directly under the object: only its top ring touches foreground
        label = Cell("Bench Desk (2)", Box(170, 123, 230, 133))
        labels, art = split_art_text([label], self.distance)
        self.assertEqual((len(labels), len(art)), (1, 0))


if __name__ == "__main__":
    unittest.main()
