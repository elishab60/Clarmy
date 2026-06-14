#!/usr/bin/env python3
"""Append themed decor frames to public/office/atlas.png + atlas.json.

Draws original 16x16 / 16x32 pixel props for the AI headquarters office:
gothic candles, knight banner, Chinese-AI posters, fancy bookshelf, etc.
Run after pack-office-atlas.py when regenerating from pixel-agents; safe to run
standalone on the committed atlas (idempotent: skips frames that already exist).
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
    # candle
    d.rectangle((x + 6, y + 4, x + 9, y + 14), fill=hex_rgb("#EDE9E0"))
    d.rectangle((x + 6, y + 2, x + 9, y + 4), fill=hex_rgb("#9B7CFF"))
    d.point((x + 7, y + 1), fill=hex_rgb("#D97757"))
    # skull
    d.ellipse((x + 4, y + 16, x + 11, y + 23), fill=hex_rgb("#EDE9E0"))
    d.point((x + 6, y + 19), fill=hex_rgb("#1F1E1C"))
    d.point((x + 9, y + 19), fill=hex_rgb("#1F1E1C"))
    d.rectangle((x + 6, y + 21, x + 9, y + 22), fill=hex_rgb("#1F1E1C"))


def draw_knight_banner(im: Image.Image, x: int, y: int) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle((x + 7, y + 0, x + 8, y + 6), fill=hex_rgb("#6A5030"))
    d.polygon([(x + 2, y + 6), (x + 14, y + 6), (x + 12, y + 28), (x + 4, y + 28)], fill=hex_rgb("#4796E3"))
    d.rectangle((x + 5, y + 10, x + 11, y + 16), fill=hex_rgb("#C9A84C"))
    d.point((x + 8, y + 13), fill=hex_rgb("#2A3040"))


def draw_poster(im: Image.Image, x: int, y: int, accent: str, label: str) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle((x + 2, y + 2, x + 13, y + 28), fill=hex_rgb("#2B2926"), outline=hex_rgb(accent))
    d.rectangle((x + 4, y + 5, x + 11, y + 12), fill=hex_rgb(accent))
    # tiny pixel "text" lines
    for i, _ in enumerate(label[:3]):
        d.rectangle((x + 4, y + 15 + i * 3, x + 10, y + 16 + i * 3), fill=hex_rgb("#EDE9E0"))


def draw_spectator_chair(im: Image.Image, x: int, y: int) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle((x + 3, y + 10, x + 12, y + 14), fill=hex_rgb("#4A6A5A"))
    d.rectangle((x + 2, y + 14, x + 13, y + 18), fill=hex_rgb("#3A4A40"))
    d.rectangle((x + 4, y + 4, x + 11, y + 10), fill=hex_rgb("#10A37F"))


def draw_bookshelf_fancy(im: Image.Image, x: int, y: int) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle((x + 1, y + 2, x + 14, y + 30), fill=hex_rgb("#6A5030"), outline=hex_rgb("#3D2E22"))
    colors = ["#D97757", "#7C9A6E", "#4796E3", "#9B7CFF", "#C9924D"]
    for row, cy in enumerate([6, 13, 20, 27]):
        for i, cx in enumerate([3, 6, 9, 12]):
            d.rectangle((x + cx, y + cy, x + cx + 2, y + cy + 5), fill=hex_rgb(colors[(row + i) % len(colors)]))


def draw_gothic_rug(im: Image.Image, x: int, y: int) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle((x, y, x + 15, y + 15), fill=hex_rgb("#2A1838"))
    d.rectangle((x + 2, y + 2, x + 13, y + 13), fill=hex_rgb("#4A2868"))
    d.point((x + 7, y + 7), fill=hex_rgb("#9B7CFF"))


def draw_stone_floor(im: Image.Image, x: int, y: int) -> None:
    d = ImageDraw.Draw(im)
    base = hex_rgb("#8A857C")
    dark = hex_rgb("#6A6560")
    d.rectangle((x, y, x + 15, y + 15), fill=base)
    d.line((x + 8, y, x + 8, y + 15), fill=dark)
    d.line((x, y + 8, x + 15, y + 8), fill=dark)


def draw_rug_wood(im: Image.Image, x: int, y: int) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle((x, y, x + 15, y + 15), fill=hex_rgb("#6A5030"))
    for i in range(0, 16, 4):
        d.line((x + i, y, x + i, y + 15), fill=hex_rgb("#5A4030"))


THEMED: list[tuple[str, tuple[int, int], callable]] = [
    ("SKULL_CANDLE", (16, 32), draw_skull_candle),
    ("KNIGHT_BANNER", (16, 32), draw_knight_banner),
    ("POSTER_DEEPSEEK", (16, 32), lambda im, x, y: draw_poster(im, x, y, "#4796E3", "DSK")),
    ("POSTER_QWEN", (16, 32), lambda im, x, y: draw_poster(im, x, y, "#D97757", "QWN")),
    ("POSTER_KIMI", (16, 32), lambda im, x, y: draw_poster(im, x, y, "#7C9A6E", "KMI")),
    ("SPECTATOR_CHAIR", (16, 32), draw_spectator_chair),
    ("BOOKSHELF_FANCY", (16, 32), draw_bookshelf_fancy),
    ("GOTHIC_RUG", (16, 16), draw_gothic_rug),
    ("STONE_FLOOR", (16, 16), draw_stone_floor),
    ("RUG_WOOD", (16, 16), draw_rug_wood),
]


def pack_new_frames(atlas: Image.Image, entries: dict, names: list[str]) -> None:
    pad = 1
    max_w = atlas.width
    # find bottom of existing content
    max_y = 0
    for meta in entries.values():
        f = meta["frame"]
        max_y = max(max_y, f["y"] + f["h"])
    x = 0
    y = max_y + pad
    shelf_h = 0

    for name, (w, h), draw_fn in THEMED:
        if name in entries:
            continue
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
        names.append(name)
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
    added: list[str] = []
    atlas = pack_new_frames(atlas, entries, added)
    atlas.save(ATLAS_PNG)
    data["frames"] = entries
    data["meta"]["size"]["h"] = atlas.height
    ATLAS_JSON.write_text(json.dumps(data, indent=1) + "\n")
    print(f"theme decor: {len(added)} new frames -> {OUT_DIR}")


if __name__ == "__main__":
    main()