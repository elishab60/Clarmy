#!/usr/bin/env python3
"""Paint the full office backdrop: public/office/office-bg-{dark,light}.png

640×384 (40×24 tiles @ 16px) — a single illustrated pixel-art floor plan with
four themed corners (gothic NW, library NE, knight hall SW, spectator SE) and a
warm parquet desk cluster in the centre. Original art, MIT like the repo.
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


def fill_rect(im: Image.Image, x: int, y: int, w: int, h: int, color: str) -> None:
    ImageDraw.Draw(im).rectangle((x, y, x + w - 1, y + h - 1), fill=rgb(color))


def fill_tile(im: Image.Image, col: int, row: int, color: str) -> None:
    fill_rect(im, col * TILE, row * TILE, TILE, TILE, color)


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
    base = "#1E1428" if dark else "#3A2850"
    accent = "#4A2868" if dark else "#6A4088"
    x, y = col * TILE, row * TILE
    d = ImageDraw.Draw(im)
    d.rectangle((x, y, x + TILE - 1, y + TILE - 1), fill=rgb(base))
    if (col * 3 + row * 5) % 7 == 0:
        d.point((x + 4, y + 4), fill=rgb(accent))
        d.point((x + 11, y + 10), fill=rgb("#9B7CFF"))


def library_tile(im: Image.Image, col: int, row: int, dark: bool) -> None:
    base = "#4A3828" if dark else "#C8B8A0"
    grain = "#3A2818" if dark else "#B0A088"
    x, y = col * TILE, row * TILE
    d = ImageDraw.Draw(im)
    d.rectangle((x, y, x + TILE - 1, y + TILE - 1), fill=rgb(base))
    for i in range(2, 14, 3):
        d.line((x + i, y + 1, x + i, y + TILE - 2), fill=rgb(grain))


def lounge_tile(im: Image.Image, col: int, row: int, dark: bool) -> None:
    base = "#1A2820" if dark else "#B8D8C8"
    dot = "#2A4030" if dark else "#98C0A8"
    x, y = col * TILE, row * TILE
    d = ImageDraw.Draw(im)
    d.rectangle((x, y, x + TILE - 1, y + TILE - 1), fill=rgb(base))
    if (col + row) % 3 == 0:
        d.point((x + 7, y + 7), fill=rgb(dot))


def draw_wall_band(im: Image.Image, dark: bool) -> None:
    wall = "#1A1816" if dark else "#8A857C"
    trim = "#2B2926" if dark else "#6A6560"
    d = ImageDraw.Draw(im)
    # top + bottom walls (2 tile thick visual)
    for c in range(COLS):
        fill_tile(im, c, 0, wall)
        fill_tile(im, c, 1, trim if dark else "#A09890")
        fill_tile(im, c, ROWS - 1, wall)
        fill_tile(im, c, ROWS - 2, trim if dark else "#A09890")
    for r in range(ROWS):
        fill_tile(im, 0, r, wall)
        fill_tile(im, 1, r, trim if dark else "#A09890")
        fill_tile(im, COLS - 1, r, wall)
        fill_tile(im, COLS - 2, r, trim if dark else "#A09890")


def draw_floor_zones(im: Image.Image, dark: bool) -> None:
    parquet_a = "#3D3228" if dark else "#D4C4A8"
    parquet_b = "#4A3E32" if dark else "#E8D8BC"
    centre_a = "#36302A" if dark else "#C8B898"
    centre_b = "#423830" if dark else "#DCC8A8"

    for row in range(2, ROWS - 2):
        for col in range(2, COLS - 2):
            # NW gothic
            if col < 10 and row < 9:
                gothic_tile(im, col, row, dark)
            # NE library
            elif col >= 30 and row < 9:
                library_tile(im, col, row, dark)
            # SW knight hall
            elif col < 10 and row >= 15:
                stone_tile(im, col, row, "#2A3040" if dark else "#A8B0C0", "#1A2030" if dark else "#8898A8")
            # SE spectator lounge
            elif col >= 28 and row >= 13:
                lounge_tile(im, col, row, dark)
            # central desk cluster (cols 12-33, rows 7-18)
            elif 12 <= col <= 33 and 7 <= row <= 18:
                parquet_tile(im, col, row, centre_a, centre_b)
            else:
                parquet_tile(im, col, row, parquet_a, parquet_b)


def draw_rugs(im: Image.Image, dark: bool) -> None:
    purple = "#2A1838" if dark else "#6A4088"
    gold = "#4A3820" if dark else "#C9A84C"
    green = "#1A3028" if dark else "#4A8A68"
    rugs = [
        (2, 3, 4, 3, purple, "#9B7CFF"),
        (32, 2, 5, 2, gold, "#D97757"),
        (2, 17, 4, 3, "#2A3040" if dark else "#8898B8", "#C9A84C"),
        (31, 17, 6, 3, green, "#10A37F"),
    ]
    for x, y, tw, th, base, border in rugs:
        d = ImageDraw.Draw(im)
        px, py = x * TILE, y * TILE
        d.rectangle((px, py, px + tw * TILE - 1, py + th * TILE - 1), fill=rgb(base), outline=rgb(border))


def draw_wall_murals(im: Image.Image, dark: bool) -> None:
    d = ImageDraw.Draw(im)
    # Gothic stained window (NW)
    wx, wy = 3 * TILE, 1 * TILE
    d.rectangle((wx, wy, wx + 3 * TILE - 1, wy + TILE - 1), fill=rgb("#1A1020" if dark else "#4A2868"))
    d.rectangle((wx + 4, wy + 2, wx + 11, wy + 13), fill=rgb("#9B7CFF"))
    d.point((wx + 8, wy + 7), fill=rgb("#EDE9E0"))

    # Library shelves mural (NE)
    bx = 33 * TILE
    for i in range(5):
        color = ["#D97757", "#7C9A6E", "#4796E3", "#9B7CFF", "#C9924D"][i]
        d.rectangle((bx + i * 3, TILE + 2, bx + i * 3 + 2, 2 * TILE - 2), fill=rgb(color))

    # Knight crest (SW)
    cx, cy = 2 * TILE, 16 * TILE
    d.rectangle((cx, cy, cx + 2 * TILE - 1, cy + TILE - 1), fill=rgb("#4796E3"))
    d.rectangle((cx + 8, cy + 4, cx + 18, cy + 10), fill=rgb("#C9A84C"))

    # Chinese-AI poster wall (SE) — baked into backdrop
    posters = [
        (32 * TILE, 14 * TILE, "#4796E3", "DS"),
        (34 * TILE, 14 * TILE, "#D97757", "QW"),
        (36 * TILE, 14 * TILE, "#7C9A6E", "KM"),
    ]
    for px, py, accent, _ in posters:
        d.rectangle((px + 2, py + 2, px + 13, py + 28), fill=rgb("#2B2926"), outline=rgb(accent))
        d.rectangle((px + 4, py + 5, px + 11, py + 12), fill=rgb(accent))


def draw_ceiling_lights(im: Image.Image, dark: bool) -> None:
    """Overhead panels — makes the room read as an office, not an abstract grid."""
    fixture = "#EDE9E0" if dark else "#F8F4EC"
    glow = "#C8C0B0" if dark else "#E8E0D0"
    d = ImageDraw.Draw(im)
    for col in range(13, 32, 4):
        x = col * TILE + 4
        d.rectangle((x, TILE + 2, x + 8, TILE + 5), fill=rgb(fixture))
        d.rectangle((x + 1, TILE + 3, x + 7, TILE + 4), fill=rgb(glow))


def draw_windows(im: Image.Image, dark: bool) -> None:
    glass = "#4796E3" if dark else "#A8C8E8"
    frame = "#2B2926" if dark else "#6A6560"
    d = ImageDraw.Draw(im)
    for col in range(10, 30, 5):
        x = col * TILE
        d.rectangle((x + 2, 2, x + TILE - 3, TILE - 1), fill=rgb(frame))
        d.rectangle((x + 4, 4, x + TILE - 5, TILE - 3), fill=rgb(glass))
        d.line((x + 8, 4, x + 8, TILE - 3), fill=rgb(frame))


def draw_ambient_lights(im: Image.Image, dark: bool) -> None:
    d = ImageDraw.Draw(im)
    glows = [
        (48, 40, 28, "#9B7CFF", 0.12 if dark else 0.08),
        (520, 48, 24, "#D97757", 0.10 if dark else 0.07),
        (48, 300, 22, "#4796E3", 0.09 if dark else 0.06),
        (500, 260, 26, "#10A37F", 0.08 if dark else 0.05),
    ]
    for cx, cy, r, color, alpha in glows:
        overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        c = rgb(color)
        od.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(c[0], c[1], c[2], int(255 * alpha)))
        im.alpha_composite(overlay)


def draw_desk_markers(im: Image.Image, dark: bool) -> None:
    """Subtle floor shadows where desk pods sit — furniture sprites layer on top."""
    shadow = "#0A0808" if dark else "#8A8070"
    d = ImageDraw.Draw(im)
    pods = [(14, 9), (19, 9), (24, 9), (29, 9), (14, 15), (19, 15), (24, 15), (29, 15)]
    for col, row in pods:
        x, y = col * TILE, row * TILE
        d.rectangle((x + 1, y + 10, x + TILE - 2, y + TILE - 1), fill=rgb(shadow))


def build(dark: bool) -> Image.Image:
    im = Image.new("RGBA", (W, H), rgb("#262421" if dark else "#EDE9E0"))
    draw_wall_band(im, dark)
    draw_windows(im, dark)
    draw_floor_zones(im, dark)
    draw_rugs(im, dark)
    draw_wall_murals(im, dark)
    draw_ceiling_lights(im, dark)
    draw_desk_markers(im, dark)
    draw_ambient_lights(im, dark)
    return im


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for mode, dark in [("dark", True), ("light", False)]:
        path = OUT / f"office-bg-{mode}.png"
        build(dark).save(path)
        print(f"wrote {path.name} ({W}×{H})")