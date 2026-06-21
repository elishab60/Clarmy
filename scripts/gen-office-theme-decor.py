#!/usr/bin/env python3
"""Append / refresh themed decor frames in public/office/atlas.png + atlas.json.

Draws original 16x16 / 16x32 pixel props for the AI headquarters office.
Safe to run standalone on the committed atlas (overwrites themed frames).
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "office"
ATLAS_PNG = OUT_DIR / "atlas.png"
ATLAS_JSON = OUT_DIR / "atlas.json"


def hex_rgb(h: str) -> tuple[int, int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def draw_skull_candle(im: Image.Image, x: int, y: int) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle((x + 6, y + 2, x + 9, y + 12), fill=hex_rgb("#EDE9E0"))
    d.rectangle((x + 6, y, x + 9, y + 2), fill=hex_rgb("#9B7CFF"))
    d.point((x + 7, y - 1 if y > 0 else y), fill=hex_rgb("#D97757"))
    d.point((x + 8, y - 1 if y > 0 else y), fill=hex_rgb("#F5E6C8"))
    d.ellipse((x + 3, y + 14, x + 12, y + 23), fill=hex_rgb("#EDE9E0"))
    d.point((x + 5, y + 18), fill=hex_rgb("#1F1E1C"))
    d.point((x + 10, y + 18), fill=hex_rgb("#1F1E1C"))
    d.rectangle((x + 6, y + 20, x + 9, y + 21), fill=hex_rgb("#1F1E1C"))
    d.point((x + 7, y + 22), fill=hex_rgb("#9B7CFF"))


def draw_gothic_altar(im: Image.Image, x: int, y: int) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle((x + 2, y + 18, x + 13, y + 30), fill=hex_rgb("#2A1838"))
    d.rectangle((x + 4, y + 8, x + 11, y + 18), fill=hex_rgb("#1A1020"))
    d.rectangle((x + 5, y + 4, x + 10, y + 8), fill=hex_rgb("#6B4CFF"))
    d.ellipse((x + 5, y + 10, x + 10, y + 15), fill=hex_rgb("#EDE9E0"))
    d.point((x + 6, y + 12), fill=hex_rgb("#1F1E1C"))
    d.point((x + 9, y + 12), fill=hex_rgb("#1F1E1C"))


def draw_knight_banner(im: Image.Image, x: int, y: int) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle((x + 7, y, x + 8, y + 8), fill=hex_rgb("#6A5030"))
    d.polygon([(x + 1, y + 8), (x + 15, y + 8), (x + 13, y + 30), (x + 3, y + 30)], fill=hex_rgb("#4796E3"))
    d.rectangle((x + 4, y + 12, x + 11, y + 20), fill=hex_rgb("#C9A84C"))
    d.point((x + 7, y + 16), fill=hex_rgb("#2A3040"))
    d.point((x + 8, y + 16), fill=hex_rgb("#2A3040"))


def draw_armor_stand(im: Image.Image, x: int, y: int) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle((x + 6, y + 26, x + 9, y + 31), fill=hex_rgb("#6A5030"))
    d.rectangle((x + 4, y + 10, x + 11, y + 22), fill=hex_rgb("#7A8AAA"))
    d.rectangle((x + 5, y + 4, x + 10, y + 10), fill=hex_rgb("#9AA8C0"))
    d.rectangle((x + 6, y + 14, x + 9, y + 16), fill=hex_rgb("#C9A84C"))


def draw_poster(im: Image.Image, x: int, y: int, accent: str, label: str) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle((x + 1, y + 1, x + 14, y + 29), fill=hex_rgb("#2B2926"), outline=hex_rgb(accent))
    d.rectangle((x + 3, y + 4, x + 12, y + 13), fill=hex_rgb(accent))
    for i, ch in enumerate(label[:3]):
        d.rectangle((x + 4, y + 16 + i * 4, x + 11, y + 18 + i * 4), fill=hex_rgb("#EDE9E0"))
    d.point((x + 7, y + 8), fill=hex_rgb("#EDE9E0"))


def draw_spectator_chair(im: Image.Image, x: int, y: int) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle((x + 2, y + 12, x + 13, y + 18), fill=hex_rgb("#3A4A40"))
    d.rectangle((x + 3, y + 18, x + 12, y + 22), fill=hex_rgb("#2A3830"))
    d.rectangle((x + 4, y + 4, x + 11, y + 12), fill=hex_rgb("#10A37F"))
    d.rectangle((x + 5, y + 6, x + 10, y + 10), fill=hex_rgb("#0A8060"))


def draw_tv_screen(im: Image.Image, x: int, y: int) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle((x, y + 2, x + 15, y + 22), fill=hex_rgb("#1A2820"))
    d.rectangle((x + 2, y + 4, x + 13, y + 18), fill=hex_rgb("#0A1810"))
    for i, col in enumerate(["#4796E3", "#D97757", "#7C9A6E"]):
        d.rectangle((x + 3 + i * 4, y + 8, x + 5 + i * 4, y + 14), fill=hex_rgb(col))
    d.rectangle((x + 5, y + 24, x + 10, y + 28), fill=hex_rgb("#2B2926"))
    d.rectangle((x + 3, y + 28, x + 12, y + 30), fill=hex_rgb("#2B2926"))


def draw_bookshelf_fancy(im: Image.Image, x: int, y: int) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle((x, y + 1, x + 15, y + 30), fill=hex_rgb("#6A5030"), outline=hex_rgb("#3D2E22"))
    colors = ["#D97757", "#7C9A6E", "#4796E3", "#9B7CFF", "#C9924D", "#B4554A"]
    for row, cy in enumerate([5, 12, 19, 26]):
        d.line((x + 1, y + cy, x + 14, y + cy), fill=hex_rgb("#3D2E22"))
        for i, cx in enumerate([2, 5, 8, 11]):
            d.rectangle((x + cx, y + cy - 4, x + cx + 2, y + cy - 1), fill=hex_rgb(colors[(row + i) % len(colors)]))


def draw_library_lamp(im: Image.Image, x: int, y: int) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle((x + 7, y + 10, x + 8, y + 28), fill=hex_rgb("#6A5030"))
    d.polygon([(x + 3, y + 10), (x + 12, y + 10), (x + 10, y + 4), (x + 5, y + 4)], fill=hex_rgb("#D97757"))
    d.ellipse((x + 2, y + 2, x + 13, y + 8), fill=hex_rgb("#F5E6C8"))


def draw_gothic_rug(im: Image.Image, x: int, y: int) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle((x, y, x + 15, y + 15), fill=hex_rgb("#1E1028"))
    d.rectangle((x + 2, y + 2, x + 13, y + 13), fill=hex_rgb("#3A2050"))
    d.point((x + 7, y + 7), fill=hex_rgb("#9B7CFF"))
    d.point((x + 5, y + 5), fill=hex_rgb("#6B4CFF"))
    d.point((x + 10, y + 10), fill=hex_rgb("#6B4CFF"))


def draw_stone_floor(im: Image.Image, x: int, y: int) -> None:
    d = ImageDraw.Draw(im)
    base = hex_rgb("#6A7078" if True else "#A8B0C0")
    dark = hex_rgb("#4A5058")
    d.rectangle((x, y, x + 15, y + 15), fill=base)
    d.line((x + 8, y, x + 8, y + 15), fill=dark)
    d.line((x, y + 8, x + 15, y + 8), fill=dark)
    d.point((x + 4, y + 4), fill=dark)
    d.point((x + 12, y + 12), fill=dark)


def draw_rug_wood(im: Image.Image, x: int, y: int) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle((x, y, x + 15, y + 15), fill=hex_rgb("#5A4030"))
    for i in range(0, 16, 4):
        d.line((x + i, y, x + i, y + 15), fill=hex_rgb("#4A3020"))
    d.rectangle((x + 4, y + 4, x + 11, y + 11), fill=hex_rgb("#6A5030"))


def draw_popcorn(im: Image.Image, x: int, y: int) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle((x + 5, y + 10, x + 10, y + 18), fill=hex_rgb("#EDE9E0"))
    d.rectangle((x + 4, y + 18, x + 11, y + 20), fill=hex_rgb("#D97757"))
    for px, py in [(6, 6), (8, 5), (10, 7), (7, 8)]:
        d.point((x + px, y + py), fill=hex_rgb("#F5E6C8"))


THEMED: list[tuple[str, tuple[int, int], callable]] = [
    ("SKULL_CANDLE", (16, 32), draw_skull_candle),
    ("GOTHIC_ALTAR", (16, 32), draw_gothic_altar),
    ("KNIGHT_BANNER", (16, 32), draw_knight_banner),
    ("ARMOR_STAND", (16, 32), draw_armor_stand),
    # Posters: refs/posters/*.png via scripts/gen-office-posters.py (32×64)
    ("TV_SCREEN", (16, 32), draw_tv_screen),
    ("SPECTATOR_CHAIR", (16, 32), draw_spectator_chair),
    ("BOOKSHELF_FANCY", (16, 32), draw_bookshelf_fancy),
    ("LIBRARY_LAMP", (16, 32), draw_library_lamp),
    ("POPCORN", (16, 16), draw_popcorn),
    ("GOTHIC_RUG", (16, 16), draw_gothic_rug),
    ("STONE_FLOOR", (16, 16), draw_stone_floor),
    ("RUG_WOOD", (16, 16), draw_rug_wood),
]


def remove_themed(entries: dict) -> None:
    for name, _size, _fn in THEMED:
        entries.pop(name, None)


def pack_themed_frames(atlas: Image.Image, entries: dict) -> Image.Image:
    remove_themed(entries)
    pad = 1
    max_w = atlas.width
    max_y = 0
    for meta in entries.values():
        f = meta["frame"]
        max_y = max(max_y, f["y"] + f["h"])
    x = 0
    y = max_y + pad
    shelf_h = 0

    for name, (w, h), draw_fn in THEMED:
        if x + w + pad > max_w:
            x = 0
            y += shelf_h + pad
            shelf_h = 0
        tile = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        draw_fn(tile, 0, 0)
        atlas.paste(tile, (x, y))
        entries[name] = {
            "frame": {"x": x, "y": y, "w": w, "h": h},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
            "sourceSize": {"w": w, "h": h},
        }
        x += w + pad
        shelf_h = max(shelf_h, h)

    new_h = y + shelf_h
    if new_h > atlas.height:
        h2 = 1 << math.ceil(math.log2(max(new_h, 1)))
        grown = Image.new("RGBA", (max_w, h2), (0, 0, 0, 0))
        grown.paste(atlas, (0, 0))
        atlas = grown
    return atlas


def main() -> None:
    data = json.loads(ATLAS_JSON.read_text())
    entries = data["frames"]
    atlas = Image.open(ATLAS_PNG).convert("RGBA")
    atlas = pack_themed_frames(atlas, entries)
    atlas.save(ATLAS_PNG)
    data["frames"] = entries
    data["meta"]["size"]["h"] = atlas.height
    ATLAS_JSON.write_text(json.dumps(data, indent=1) + "\n")
    print(f"theme decor: {len(THEMED)} frames refreshed -> {OUT_DIR}")


if __name__ == "__main__":
    main()