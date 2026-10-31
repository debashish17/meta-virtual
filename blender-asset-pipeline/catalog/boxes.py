"""Axis-aligned boxes in board pixel coordinates (y grows downwards)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Box:
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def w(self) -> float:
        return self.x1 - self.x0

    @property
    def h(self) -> float:
        return self.y1 - self.y0

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def area(self) -> float:
        return max(0.0, self.w) * max(0.0, self.h)

    def union(self, other: Box) -> Box:
        return Box(min(self.x0, other.x0), min(self.y0, other.y0), max(self.x1, other.x1), max(self.y1, other.y1))

    def x_overlap(self, other: Box) -> float:
        return max(0.0, min(self.x1, other.x1) - max(self.x0, other.x0))

    def contains(self, other: Box) -> bool:
        return self.x0 <= other.x0 and self.y0 <= other.y0 and self.x1 >= other.x1 and self.y1 >= other.y1

    def clip_x(self, lo: float, hi: float) -> Box:
        return Box(max(self.x0, lo), self.y0, min(self.x1, hi), self.y1)

    def as_list(self) -> list[float]:
        return [round(v, 1) for v in (self.x0, self.y0, self.x1, self.y1)]


def union_all(boxes: list[Box]) -> Box:
    out = boxes[0]
    for b in boxes[1:]:
        out = out.union(b)
    return out
