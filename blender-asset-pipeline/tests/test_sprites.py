"""Reference crops -> scene sprites: holes closed, background kept, trimmed."""

import unittest

import numpy as np
from PIL import Image

from catalog.sprites import prepare_sprite


def ring(size=40, notch=False):
    """Opaque square ring with a transparent centre; optionally a notch cut to the outer edge."""
    rgba = np.zeros((size, size, 4), np.uint8)
    rgba[5:35, 5:35] = (200, 50, 50, 255)
    rgba[15:25, 15:25, 3] = 0          # hole inside the object (e.g. white text masked out)
    if notch:
        rgba[18:22, 0:35, 3] = 0        # gap reaching the outside: real background, not a hole
    return Image.fromarray(rgba, "RGBA")


class PrepareSpriteTest(unittest.TestCase):
    def test_enclosed_holes_become_opaque_and_keep_their_colour(self):
        sprite = np.array(prepare_sprite(ring()))
        self.assertEqual(sprite[sprite.shape[0] // 2, sprite.shape[1] // 2, 3], 255)
        self.assertEqual(tuple(sprite[sprite.shape[0] // 2, sprite.shape[1] // 2, :3]), (200, 50, 50))

    def test_gaps_open_to_the_outside_stay_transparent(self):
        sprite = np.array(prepare_sprite(ring(notch=True)))
        self.assertEqual(sprite[sprite.shape[0] // 2, 2, 3], 0)

    def test_trims_to_the_object_with_a_one_pixel_margin(self):
        self.assertEqual(prepare_sprite(ring()).size, (32, 32))


BOARD = (236, 235, 233)


def loop(hole_rgb):
    """Opaque ring on board-coloured transparent background; its enclosed centre has `hole_rgb`."""
    rgba = np.zeros((40, 40, 4), np.uint8)
    rgba[:, :, :3] = BOARD
    rgba[5:35, 5:35] = (40, 40, 40, 255)
    rgba[15:25, 15:25] = (*hole_rgb, 0)
    return Image.fromarray(rgba, "RGBA")


class OpenHolesTest(unittest.TestCase):
    """Items listed in data/sprites.toml show real background through an enclosed gap (the space
    inside a headband), so board-coloured holes stay clear; anything else still closes."""

    def test_board_coloured_hole_stays_transparent(self):
        sprite = np.array(prepare_sprite(loop(BOARD), open_holes=True))
        self.assertEqual(sprite[sprite.shape[0] // 2, sprite.shape[1] // 2, 3], 0)

    def test_hole_in_the_objects_own_colour_still_closes(self):
        sprite = np.array(prepare_sprite(loop((200, 50, 50)), open_holes=True))
        self.assertEqual(sprite[sprite.shape[0] // 2, sprite.shape[1] // 2, 3], 255)

    def test_unlisted_items_close_board_coloured_holes_as_before(self):
        sprite = np.array(prepare_sprite(loop(BOARD)))
        self.assertEqual(sprite[sprite.shape[0] // 2, sprite.shape[1] // 2, 3], 255)


class BoardMatteTest(unittest.TestCase):
    """Crops carry the board's colour in their transparent pixels, so shadows, pale rims and pale
    parts of the object can be told apart from the board."""

    @staticmethod
    def board(size=60):
        rgba = np.zeros((size, size, 4), np.uint8)
        rgba[:, :, :3] = BOARD
        return rgba

    def test_drop_shadow_in_the_boards_tone_is_removed(self):
        rgba = self.board(80)
        rgba[10:40, 10:40] = (40, 40, 40, 255)                                   # the object
        shade = np.clip(1 - np.hypot(*np.mgrid[-20:20, -20:20]) / 20, 0, 1)      # soft shadow below it
        for (y, x), k in np.ndenumerate(shade):
            if k > 0 and not (10 <= y + 22 < 40 and 10 <= x + 8 < 40):
                tone = np.array(BOARD) * (1 - 0.25 * k)
                rgba[y + 22, x + 8] = (*tone.astype(np.uint8), int(255 * min(1, k * 2)))
        sprite = np.array(prepare_sprite(Image.fromarray(rgba, "RGBA")))
        self.assertEqual(sprite.shape[:2], (32, 32))                             # just the object, 1 px margin
        self.assertEqual(sprite[16, 16, 3], 255)

    def test_white_object_inside_its_outline_stays_solid(self):
        rgba = self.board()
        rgba[10:40, 10:40] = (120, 120, 120, 255)                                # grey outline
        rgba[13:37, 13:37] = (*BOARD, 0)                                         # board-white body the segmentation dropped
        sprite = np.array(prepare_sprite(Image.fromarray(rgba, "RGBA")))
        self.assertEqual(sprite[sprite.shape[0] // 2, sprite.shape[1] // 2, 3], 255)

    def test_no_pale_rim_round_a_dark_object(self):
        rgba = self.board()
        rgba[10:40, 10:40] = (30, 30, 30, 255)
        rgba[9, 9:41] = rgba[40, 9:41] = (200, 199, 197, 160)                    # anti-aliased board mix
        rgba[9:41, 9] = rgba[9:41, 40] = (200, 199, 197, 160)
        sprite = np.array(prepare_sprite(Image.fromarray(rgba, "RGBA")))
        visible = sprite[:, :, 3] > 40
        self.assertLess(sprite[visible][:, :3].max(), 120)


if __name__ == "__main__":
    unittest.main()
