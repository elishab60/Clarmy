#!/usr/bin/env python3
"""Paint the full office backdrop: public/office/office-bg-{dark,light}.png

640×384 (40×24 tiles @ 16px) — illustrated pixel-art floor plan with four themed
corners and a warm central desk cluster. Original art, MIT like the repo.
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
    trim = "#2B2926" if dark else "#6A6560"
    wainscot = "#1F1E1C" if dark else "#A09890"
    for c in range(COLS):
        fill_tile(im, c, 0, wall)
        fill_tile(im, c, 1, trim if dark else wainscot)
        fill_tile(im, c, ROWS - 1, wall)
        fill_tile(im, c, ROWS - 2, trim if dark else wainscot)
    for r in range(ROWS):
        fill_tile(im, 0, r, wall)
        fill_tile(im, 1, r, trim if dark else wainscot)
        fill_tile(im, COLS - 1, r, wall)
        fill_tile(im, COLS - 2, r, trim if dark else wainscot)


def draw_floor_zones(im: Image.Image, dark: bool) -> None:
    parquet_a = "#3D3228" if dark else "#D4C4A8"
    parquet_b = "#4A3E32" if dark else "#E8D8BC"
    centre_a = "#36302A" if dark else "#C8B898"
    centre_b = "#423830" if dark else "#DCC8A8"

    for row in range(2, ROWS - 2):
        for col in range(2, COLS - 2):
            if col < 10 and row < 9:
                gothic_tile(im, col, row, dark)
            elif col >= 30 and row < 9:
                library_tile(im, col, row, dark)
            elif col < 10 and row >= 15:
                stone_tile(im, col, row, "#2A3040" if dark else "#A8B0C0", "#1A2030" if dark else "#8898A8")
            elif col >= 28 and row >= 13:
                lounge_tile(im, col, row, dark)
            elif 12 <= col <= 33 and 7 <= row <= 18:
                parquet_tile(im, col, row, centre_a, centre_b)
            else:
                parquet_tile(im, col, row, parquet_a, parquet_b)


def draw_rugs(im: Image.Image, dark: bool) -> None:
    rugs = [
        (2, 3, 5, 3, "#1E1028" if dark else "#5A3078", "#9B7CFF"),
        (31, 2, 6, 2, "#4A3820" if dark else "#C9A84C", "#D97757"),
        (2, 16, 5, 3, "#2A3040" if dark else "#8898B8", "#C9A84C"),
        (30, 16, 8, 4, "#1A3028" if dark else "#4A8A68", "#10A37F"),
    ]
    d = ImageDraw.Draw(im)
    for x, y, tw, th, base, border in rugs:
        px, py = x * TILE, y * TILE
        d.rectangle((px, py, px + tw * TILE - 1, py + th * TILE - 1), fill=rgb(base), outline=rgb(border))
        # inner pattern
        d.point((px + tw * TILE // 2, py + th * TILE // 2), fill=rgb(border))


def draw_gothic_corner(im: Image.Image, dark: bool) -> None:
    """NW — Nécropolis: moon window, altar silhouette, candle glow."""
    d = ImageDraw.Draw(im)
    # arched window with moon
    wx, wy = 2 * TILE, TILE
    d.rectangle((wx, wy, wx + 4 * TILE - 1, wy + TILE - 1), fill=rgb("#120818" if dark else "#4A2868"))
    d.ellipse((wx + 20, wy + 2, wx + 36, wy + 12), fill=rgb("#9B7CFF" if dark else "#C4B0FF"))
    d.point((wx + 28, wy + 6), fill=rgb("#EDE9E0"))
    # altar painted on floor
    ax, ay = 3 * TILE, 4 * TILE
    d.rectangle((ax, ay + 8, ax + 2 * TILE - 1, ay + 2 * TILE - 1), fill=rgb("#2A1838" if dark else "#6A4088"))
    d.rectangle((ax + 8, ay, ax + 18, ay + 10), fill=rgb("#1A1020" if dark else "#4A2868"))
    # skull motif on altar
    d.ellipse((ax + 10, ay + 12, ax + 16, ay + 18), fill=rgb("#EDE9E0"))
    d.point((ax + 12, ay + 15), fill=rgb("#1F1E1C"))
    d.point((ax + 14, ay + 15), fill=rgb("#1F1E1C"))


def draw_library_corner(im: Image.Image, dark: bool) -> None:
    """NE — Bibliothèque: built-in shelves, warm lamp."""
    d = ImageDraw.Draw(im)
    bx = 32 * TILE
    shelf = "#5A4030" if dark else "#8A7060"
    for row_i in range(3):
        sy = TILE + 2 + row_i * 5
        d.rectangle((bx, sy, bx + 6 * TILE - 1, sy + 4), fill=rgb(shelf))
        colors = ["#D97757", "#7C9A6E", "#4796E3", "#9B7CFF", "#C9924D", "#B4554A"]
        for i, cx in enumerate(range(bx + 4, bx + 6 * TILE - 4, 10)):
            d.rectangle((cx, sy + 1, cx + 6, sy + 3), fill=rgb(colors[i % len(colors)]))
    # reading lamp glow
    lx, ly = 35 * TILE + 4, 3 * TILE
    d.rectangle((lx, ly, lx + 4, ly + 8), fill=rgb("#D97757"))
    d.ellipse((lx - 6, ly - 4, lx + 14, ly + 6), fill=rgb("#D97757" if dark else "#E8A878"))


def draw_knight_hall(im: Image.Image, dark: bool) -> None:
    """SW — Grand Salon: pillars, crest, shield."""
    d = ImageDraw.Draw(im)
    pillar = "#4A5060" if dark else "#8898A8"
    for px in (2 * TILE, 6 * TILE):
        d.rectangle((px, 15 * TILE, px + 6, 22 * TILE), fill=rgb(pillar))
        d.rectangle((px - 2, 15 * TILE, px + 8, 15 * TILE + 4), fill=rgb("#C9A84C"))
    # crest on wall
    cx, cy = 2 * TILE, 15 * TILE
    d.rectangle((cx, cy, cx + 2 * TILE - 1, cy + TILE - 1), fill=rgb("#4796E3"))
    d.rectangle((cx + 8, cy + 4, cx + 20, cy + 10), fill=rgb("#C9A84C"))
    d.point((cx + 14, cy + 7), fill=rgb("#2A3040"))
    # shield on floor
    sx, sy = 4 * TILE, 19 * TILE
    d.polygon([(sx + 8, sy), (sx + 14, sy + 6), (sx + 8, sy + 14), (sx + 2, sy + 6)], fill=rgb("#6A7A9A"))


def draw_spectator_lounge(im: Image.Image, dark: bool) -> None:
    """SE — Zone Dégout: TV wall, couch silhouette, popcorn."""
    d = ImageDraw.Draw(im)
    # big TV screen
    tx, ty = 31 * TILE, 14 * TILE
    d.rectangle((tx, ty, tx + 7 * TILE - 1, ty + 2 * TILE - 1), fill=rgb("#1A2820" if dark else "#2A4840"))
    d.rectangle((tx + 4, ty + 4, tx + 7 * TILE - 8, ty + 2 * TILE - 8), fill=rgb("#0A1810" if dark else "#1A3830"))
    # Chinese AI logos on screen (tiny pixels)
    logos = [(tx + 12, "#4796E3"), (tx + 36, "#D97757"), (tx + 60, "#7C9A6E")]
    for lx, col in logos:
        d.rectangle((lx, ty + 10, lx + 10, ty + 18), fill=rgb(col))
    # couch
    d.rectangle((32 * TILE, 20 * TILE, 37 * TILE - 1, 21 * TILE + 10), fill=rgb("#3A5A48" if dark else "#6A9A78"))
    d.rectangle((32 * TILE + 2, 20 * TILE - 6, 37 * TILE - 3, 20 * TILE + 2), fill=rgb("#10A37F" if dark else "#2A8868"))
    # popcorn bucket
    d.rectangle((37 * TILE, 20 * TILE + 4, 37 * TILE + 8, 21 * TILE + 10), fill=rgb("#EDE9E0"))
    d.point((37 * TILE + 4, 20 * TILE + 2), fill=rgb("#F5E6C8"))


def draw_wall_murals(im: Image.Image, dark: bool) -> None:
    d = ImageDraw.Draw(im)
    # stained glass (gothic)
    wx, wy = 3 * TILE, 1 * TILE
    d.rectangle((wx, wy, wx + 3 * TILE - 1, wy + TILE - 1), fill=rgb("#1A1020" if dark else "#4A2868"))
    d.rectangle((wx + 4, wy + 2, wx + 11, wy + 13), fill=rgb("#9B7CFF"))
    d.point((wx + 8, wy + 7), fill=rgb("#EDE9E0"))

    # poster wall labels baked in
    posters = [
        (32 * TILE, 14 * TILE, "#4796E3", "DS"),
        (34 * TILE, 14 * TILE, "#D97757", "QW"),
        (36 * TILE, 14 * TILE, "#7C9A6E", "KM"),
    ]
    for px, py, accent, _ in posters:
        d.rectangle((px + 2, py + 2, px + 13, py + 28), fill=rgb("#2B2926"), outline=rgb(accent))
        d.rectangle((px + 4, py + 5, px + 11, py + 12), fill=rgb(accent))


def draw_ceiling_lights(im: Image.Image, dark: bool) -> None:
    fixture = "#EDE9E0" if dark else "#F8F4EC"
    glow = "#C8C0B0" if dark else "#E8E0D0"
    d = ImageDraw.Draw(im)
    for col in range(13, 32, 4):
        x = col * TILE + 4
        d.rectangle((x, TILE + 2, x + 8, TILE + 5), fill=rgb(fixture))
        d.rectangle((x + 1, TILE + 3, x + 7, TILE + 4), fill=rgb(glow))
        # light cone on floor
        fx = col * TILE + 8
        d.polygon([(fx, 3 * TILE), (fx - 20, 10 * TILE), (fx + 20, 10 * TILE)],
                  fill=rgb("#EDE9E0" if dark else "#F8F4EC"))


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
        (48, 40, 32, "#9B7CFF", 0.14 if dark else 0.09),
        (520, 48, 28, "#D97757", 0.12 if dark else 0.08),
        (48, 300, 26, "#4796E3", 0.11 if dark else 0.07),
        (500, 260, 30, "#10A37F", 0.10 if dark else 0.06),
        (320, 180, 40, "#EDE9E0", 0.04 if dark else 0.03),
    ]
    for cx, cy, r, color, alpha in glows:
        overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        c = rgb(color)
        od.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(c[0], c[1], c[2], int(255 * alpha)))
        im.alpha_composite(overlay)


def draw_desk_markers(im: Image.Image, dark: bool) -> None:
    shadow = "#0A0808" if dark else "#8A8070"
    cable = "#2B2926" if dark else "#6A6560"
    d = ImageDraw.Draw(im)
    pods = [(14, 9), (19, 9), (24, 9), (29, 9), (14, 15), (19, 15), (24, 15), (29, 15)]
    for col, row in pods:
        x, y = col * TILE, row * TILE
        d.rectangle((x + 1, y + 10, x + TILE - 2, y + TILE - 1), fill=rgb(shadow))
        d.line((x + 8, y + TILE, x + 8, y + TILE + 4), fill=rgb(cable))


def draw_central_details(im: Image.Image, dark: bool) -> None:
    """Plants, whiteboard silhouette, coffee station hint in the centre aisles."""
    d = ImageDraw.Draw(im)
    plant = "#7C9A6E" if dark else "#5A8A58"
    pot = "#6A5030" if dark else "#8A7060"
    for col, row in [(12, 10), (33, 10), (12, 16), (33, 16)]:
        x, y = col * TILE + 4, row * TILE + 2
        d.rectangle((x + 2, y + 8, x + 8, y + 12), fill=rgb(pot))
        d.ellipse((x, y, x + 10, y + 10), fill=rgb(plant))
    # whiteboard on centre-back wall
    wb_x = 20 * TILE
    d.rectangle((wb_x, 2 * TILE, wb_x + 4 * TILE, 3 * TILE + 8), fill=rgb("#EDE9E0" if dark else "#F8F4EC"))
    d.line((wb_x + 8, 2 * TILE + 6, wb_x + 40, 2 * TILE + 6), fill=rgb("#4796E3"))
    d.line((wb_x + 8, 2 * TILE + 12, wb_x + 28, 2 * TILE + 12), fill=rgb("#D97757"))


def build(dark: bool) -> Image.Image:
    im = Image.new("RGBA", (W, H), rgb("#262421" if dark else "#EDE9E0"))
    draw_wall_band(im, dark)
    draw_windows(im, dark)
    draw_floor_zones(im, dark)
    draw_rugs(im, dark)
    draw_gothic_corner(im, dark)
    draw_library_corner(im, dark)
    draw_knight_hall(im, dark)
    draw_spectator_lounge(im, dark)
    draw_wall_murals(im, dark)
    draw_ceiling_lights(im, dark)
    draw_central_details(im, dark)
    draw_desk_markers(im, dark)
    draw_ambient_lights(im, dark)
    return im


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for mode, dark in [("dark", True), ("light", False)]:
        path = OUT / f"office-bg-{mode}.png"
        build(dark).save(path)
        print(f"wrote {path.name} ({W}×{H})")