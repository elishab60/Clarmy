#!/usr/bin/env python3
"""Paint the office backdrop: public/office/office-bg-{dark,light}.png

640×384 (40×24 tiles @ 16px). FOUR provider quadrants with themed floors, split
by central aisles. Just floors + walls + soft zone glows — all furniture is HD
decor drawn by Phaser, so nothing is painted here that would clash with it.
Quadrants match layout.ts: Grok NW, Claude NE, Gemini SW, Codex SE.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "office"
COLS, ROWS, TILE = 40, 24, 16
W, H = COLS * TILE, ROWS * TILE


def rgb(h: str) -> tuple[int, int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def fill_tile(im: Image.Image, col: int, row: int, color: str) -> None:
    ImageDraw.Draw(im).rectangle((col * TILE, row * TILE, col * TILE + TILE - 1, row * TILE + TILE - 1), fill=rgb(color))


def parquet_tile(im: Image.Image, col: int, row: int, base: str, alt: str) -> None:
    x, y = col * TILE, row * TILE
    d = ImageDraw.Draw(im)
    d.rectangle((x, y, x + TILE - 1, y + TILE - 1), fill=rgb(base))
    if (col + row) % 2:
        d.rectangle((x + 2, y + 2, x + TILE - 3, y + TILE - 3), fill=rgb(alt))
    d.line((x, y + 8, x + TILE - 1, y + 8), fill=rgb(alt), width=1)


def stone_tile(im: Image.Image, col: int, row: int, base: str, seam: str) -> None:
    x, y = col * TILE, row * TILE
    d = ImageDraw.Draw(im)
    d.rectangle((x, y, x + TILE - 1, y + TILE - 1), fill=rgb(base))
    d.line((x + 8, y, x + 8, y + TILE - 1), fill=rgb(seam))
    d.line((x, y + 8, x + TILE - 1, y + 8), fill=rgb(seam))


def gothic_tile(im: Image.Image, col: int, row: int, dark: bool) -> None:
    base = "#1A1020" if dark else "#3A2850"
    accent = "#3A2050" if dark else "#5A3878"
    x, y = col * TILE, row * TILE
    d = ImageDraw.Draw(im)
    d.rectangle((x, y, x + TILE - 1, y + TILE - 1), fill=rgb(base))
    if (col + row) % 3 == 0:
        d.point((x + 3, y + 3), fill=rgb(accent))
        d.point((x + 12, y + 11), fill=rgb("#6B4CFF" if dark else "#9B7CFF"))


def library_tile(im: Image.Image, col: int, row: int, dark: bool) -> None:
    base = "#4A3828" if dark else "#C8B8A0"
    grain = "#3A2818" if dark else "#A89880"
    x, y = col * TILE, row * TILE
    d = ImageDraw.Draw(im)
    d.rectangle((x, y, x + TILE - 1, y + TILE - 1), fill=rgb(base))
    for i in range(2, 14, 3):
        d.line((x + i, y + 1, x + i, y + TILE - 2), fill=rgb(grain))


def lounge_tile(im: Image.Image, col: int, row: int, dark: bool) -> None:
    base = "#142820" if dark else "#A8D0B8"
    dot = "#243830" if dark else "#88B8A0"
    x, y = col * TILE, row * TILE
    d = ImageDraw.Draw(im)
    d.rectangle((x, y, x + TILE - 1, y + TILE - 1), fill=rgb(base))
    if (col + row) % 3 == 0:
        d.point((x + 7, y + 7), fill=rgb(dot))


def draw_wall_band(im: Image.Image, dark: bool) -> None:
    wall = "#141210" if dark else "#8A857C"
    trim = "#2B2926" if dark else "#A09890"
    for c in range(COLS):
        fill_tile(im, c, 0, wall); fill_tile(im, c, 1, trim)
        fill_tile(im, c, ROWS - 1, wall); fill_tile(im, c, ROWS - 2, trim)
    for r in range(ROWS):
        fill_tile(im, 0, r, wall); fill_tile(im, 1, r, trim)
        fill_tile(im, COLS - 1, r, wall); fill_tile(im, COLS - 2, r, trim)


def quadrant(col: int, row: int) -> str:
    """Which provider quadrant a tile belongs to (matches layout.ts)."""
    if col <= 18 and row <= 10: return "grok"      # NW
    if col >= 21 and row <= 10: return "claude"    # NE
    if col <= 18 and row >= 13: return "gemini"    # SW
    if col >= 21 and row >= 13: return "codex"     # SE
    return "aisle"


def draw_floor(im: Image.Image, dark: bool) -> None:
    aisle_a = "#3D3228" if dark else "#D4C4A8"
    aisle_b = "#4A3E32" if dark else "#E8D8BC"
    for row in range(2, ROWS - 2):
        for col in range(2, COLS - 2):
            q = quadrant(col, row)
            if q == "grok":
                gothic_tile(im, col, row, dark)
            elif q == "claude":
                library_tile(im, col, row, dark)
            elif q == "gemini":
                stone_tile(im, col, row, "#2A3040" if dark else "#A8B0C0", "#1A2030" if dark else "#8898A8")
            elif q == "codex":
                lounge_tile(im, col, row, dark)
            else:
                parquet_tile(im, col, row, aisle_a, aisle_b)


def draw_zone_glows(im: Image.Image, dark: bool) -> None:
    """Soft accent glow at each quadrant centre for ambiance (no painted props)."""
    glows = [
        (9 * TILE + 8, 6 * TILE, "#9B7CFF"),   # grok NW
        (29 * TILE + 8, 6 * TILE, "#D97757"),  # claude NE
        (9 * TILE + 8, 18 * TILE, "#4796E3"),  # gemini SW
        (29 * TILE + 8, 18 * TILE, "#10A37F"), # codex SE
    ]
    alpha = 0.13 if dark else 0.08
    for cx, cy, color in glows:
        overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        c = rgb(color)
        r = 70
        od.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(c[0], c[1], c[2], int(255 * alpha)))
        im.alpha_composite(overlay)


def build(dark: bool) -> Image.Image:
    im = Image.new("RGBA", (W, H), rgb("#262421" if dark else "#EDE9E0"))
    draw_wall_band(im, dark)
    draw_floor(im, dark)
    draw_zone_glows(im, dark)
    return im


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for mode, dark in [("dark", True), ("light", False)]:
        path = OUT / f"office-bg-{mode}.png"
        build(dark).save(path)
        print(f"wrote {path.name} ({W}×{H})")
