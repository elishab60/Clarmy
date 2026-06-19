"""Shared image helpers for the office sprite pipeline."""

from __future__ import annotations

from PIL import Image

from spritecfg import get


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def chroma_key() -> tuple[int, int, int]:
    return hex_rgb(get("chromaKey", "#00ff00"))


def find_bbox(im: Image.Image, min_density: float = 0.02) -> tuple[int, int, int, int] | None:
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    cols = []
    for x in range(w):
        n = sum(1 for y in range(h) if px[x, y][3] > 12)
        if n >= h * min_density:
            cols.append(x)
    if not cols:
        return None
    rows = []
    for y in range(h):
        n = sum(1 for x in range(w) if px[x, y][3] > 12)
        if n >= w * min_density:
            rows.append(y)
    if not rows:
        return None
    return cols[0], rows[0], cols[-1] + 1, rows[-1] + 1


def trim_alpha(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    box = find_bbox(im)
    return im.crop(box) if box else im