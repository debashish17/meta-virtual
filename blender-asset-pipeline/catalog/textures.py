"""Seamless greyscale detail textures for the kit's materials (fabric weave, acoustic felt, oak
grain, leather, concrete, cork, rug loops), matched to what the reference boards show.

Each map averages 0.75 with variation either side; blender_kit/materials.py multiplies it into the
palette colour (divided by 0.75), so a textured material keeps its calibrated colour on average.
Noise is synthesised in the frequency domain, which makes every map tile without seams.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
from PIL import Image

MEAN = 0.75


def _field(rng: np.random.Generator, size: int, beta: float, stretch: tuple[float, float] = (1.0, 1.0)) -> np.ndarray:
    """Tileable 1/f^beta noise, zero mean and unit spread; `stretch` elongates features along x/y."""
    ky = np.fft.fftfreq(size)[:, None] * stretch[1]
    kx = np.fft.fftfreq(size)[None, :] * stretch[0]
    k = np.sqrt(kx ** 2 + ky ** 2)
    k[0, 0] = 1.0
    spectrum = np.fft.fft2(rng.standard_normal((size, size))) / k ** beta
    spectrum[0, 0] = 0.0
    out = np.real(np.fft.ifft2(spectrum))
    return (out - out.mean()) / (out.std() + 1e-9)


def _weave(rng, size):
    """Plain-weave upholstery: over-under threads every 4 px with heathered yarn."""
    y, x = np.mgrid[0:size, 0:size]
    period = 4
    warp = np.cos(2 * np.pi * x / period) * 0.5 + 0.5
    weft = np.cos(2 * np.pi * y / period) * 0.5 + 0.5
    over = ((x // period + y // period) % 2).astype(float)
    threads = over * warp + (1 - over) * weft
    heather = _field(rng, size, 0.35)                # fine yarn colour variation
    slub = _field(rng, size, 1.0, stretch=(6.0, 1.0))  # thicker runs along the weft
    return 0.5 * (threads - 0.5) * 2 + 0.3 * heather + 0.15 * slub


def _felt(rng, size):
    """Needle felt of acoustic panels: dense fibre speckle over soft mottling."""
    return 0.6 * _field(rng, size, 0.1) + 0.15 * _field(rng, size, 1.2)


def _wood(rng, size):
    """Oak: grain lines running along x, warped by slow figure, with pores."""
    y = np.mgrid[0:size, 0:size][0] / size
    figure = _field(rng, size, 2.2, stretch=(4.0, 1.0))         # damping x frequencies stretches features along x
    rings = np.sin(2 * np.pi * (7 * y + 0.22 * figure)) * 0.5
    streaks = _field(rng, size, 1.0, stretch=(12.0, 1.0))
    pores = _field(rng, size, 0.3, stretch=(3.0, 1.0))
    return 0.45 * rings + 0.45 * streaks + 0.18 * pores


def _leather(rng, size):
    """Pebbled leather grain."""
    pebble = _field(rng, size, 0.45)
    return 0.6 * np.tanh(pebble * 1.2) + 0.2 * _field(rng, size, 1.6)


def _concrete(rng, size):
    """Cast concrete: broad clouds, aggregate speckle and a few pits."""
    pits = (_field(rng, size, 0.2) > 2.6).astype(float)
    return 0.6 * _field(rng, size, 1.7) + 0.3 * _field(rng, size, 0.4) - 1.2 * pits


def _cork(rng, size):
    """Cork board: coarse granules."""
    return 0.7 * np.tanh(_field(rng, size, 0.7) * 2.0) + 0.2 * _field(rng, size, 1.5)


def _rug(rng, size):
    """Loop-pile rug: tight rows of loops with a soft heather."""
    y, x = np.mgrid[0:size, 0:size]
    loops = np.cos(2 * np.pi * x / 3) * np.cos(2 * np.pi * y / 3)
    return 0.45 * loops + 0.4 * _field(rng, size, 1.2) + 0.2 * _field(rng, size, 0.3)


# kind: (generator, contrast as twice the standard deviation)
KINDS = {"weave": (_weave, 0.2), "felt": (_felt, 0.18), "wood": (_wood, 0.3), "leather": (_leather, 0.16),
         "concrete": (_concrete, 0.16), "cork": (_cork, 0.28), "rug": (_rug, 0.22)}


def detail(kind: str, size: int = 512) -> np.ndarray:
    """Greyscale map in [0, 1] averaging MEAN, deterministic per kind."""
    make, amplitude = KINDS[kind]
    rng = np.random.default_rng(int(hashlib.sha256(kind.encode()).hexdigest()[:8], 16))
    raw = make(rng, size)
    tex = np.clip(MEAN + 0.5 * amplitude * raw / max(raw.std(), 1e-9), 0.0, 1.0)
    return np.clip(tex - tex.mean() + MEAN, 0.0, 1.0)   # re-centre after clipping


def write_textures(out_dir: Path, size: int = 512) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for kind in KINDS:
        path = out_dir / f"{kind}.png"
        Image.fromarray(np.round(detail(kind, size) * 255).astype(np.uint8), "L").save(path)
        written.append(path)
    return written
