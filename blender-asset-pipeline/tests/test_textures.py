"""Detail textures: seamless, deterministic, and centred so tinting keeps the palette colour."""

import unittest

import numpy as np

from catalog.textures import KINDS, MEAN, detail


class DetailTextureTest(unittest.TestCase):
    def test_every_kind_tiles_without_a_seam(self):
        for kind in KINDS:
            tex = detail(kind, 128)
            inner = np.abs(np.diff(tex, axis=1)).mean()
            wrap = np.abs(tex[:, 0] - tex[:, -1]).mean()
            self.assertLess(wrap, inner * 2.5, kind)
            inner_v = np.abs(np.diff(tex, axis=0)).mean()
            wrap_v = np.abs(tex[0, :] - tex[-1, :]).mean()
            self.assertLess(wrap_v, inner_v * 2.5, kind)

    def test_is_deterministic(self):
        self.assertTrue(np.array_equal(detail("weave", 64), detail("weave", 64)))

    def test_stays_in_range_around_its_target_brightness(self):
        for kind in KINDS:
            tex = detail(kind, 128)
            self.assertTrue(0.0 <= tex.min() and tex.max() <= 1.0, kind)
            self.assertAlmostEqual(float(tex.mean()), MEAN, delta=0.02, msg=kind)


if __name__ == "__main__":
    unittest.main()
