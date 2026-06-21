"""Shared helpers for 2× HD office atlas generation."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "office"
ATLAS_PNG = OUT_DIR / "atlas.png"
ATLAS_JSON = OUT_DIR / "atlas.json"

TILE = 32          # 2× legacy 16px tile
TALL = 64          # 2× legacy 32px tall prop
DISPLAY_SCALE = 0.5  # Phaser renders HD art at half size


def rgb(h: str) -> tuple[int, int, int, int]:
    h = h.lstrip("#")
    if len(h) == 8:
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), int(h[6:8], 16))
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def grow(im: Image.Image, need_h: int) -> Image.Image:
    if need_h <= im.height:
        return im
    h2 = 1 << math.ceil(math.log2(max(need_h, 1)))
    out = Image.new("RGBA", (im.width, h2), (0, 0, 0, 0))
    out.paste(im, (0, 0))
    return out


def upscale2(im: Image.Image) -> Image.Image:
    w, h = im.size
    return im.resize((w * 2, h * 2), Image.NEAREST)


def frame_entry(x: int, y: int, w: int, h: int) -> dict:
    return {
        "frame": {"x": x, "y": y, "w": w, "h": h},
        "rotated": False,
        "trimmed": False,
        "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
        "sourceSize": {"w": w, "h": h},
    }


def pack_frames(frames: dict[str, Image.Image], max_w: int = 512) -> tuple[Image.Image, dict]:
    pad = 1
    items = sorted(frames.items(), key=lambda kv: -kv[1].height)
    atlas = Image.new("RGBA", (max_w, 256), (0, 0, 0, 0))
    entries: dict = {}
    x = y = shelf_h = 0

    for name, im in items:
        w, h = im.size
        if x + w + pad > max_w:
            x, y, shelf_h = 0, y + shelf_h + pad, 0
        atlas = grow(atlas, y + h)
        atlas.paste(im, (x, y))
        entries[name] = frame_entry(x, y, w, h)
        x += w + pad
        shelf_h = max(shelf_h, h)

    atlas = grow(atlas, y + shelf_h)
    return atlas, entries


def paint_grid(im: Image.Image, ox: int, oy: int, rows: list[str], palette: dict[str, str]) -> None:
    px = im.load()
    for ry, row in enumerate(rows):
        for rx, ch in enumerate(row):
            if ch in (".", " "):
                continue
            col = palette.get(ch)
            if col:
                c = rgb(col)
                px[ox + rx, oy + ry] = c


def save_atlas(frames: dict[str, Image.Image]) -> None:
    atlas, entries = pack_frames(frames)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    atlas.save(ATLAS_PNG)
    payload = {
        "frames": entries,
        "meta": {
            "image": "atlas.png",
            "size": {"w": atlas.width, "h": atlas.height},
            "scale": "2",
            "displayScale": str(DISPLAY_SCALE),
        },
    }
    ATLAS_JSON.write_text(json.dumps(payload, indent=1) + "\n")
    print(f"HD atlas {atlas.width}×{atlas.height} — {len(entries)} frames")


def load_upscaled_furniture() -> dict[str, Image.Image]:
    """2× NEAREST upscale of legacy furniture from the committed atlas."""
    keep = {
        "DESK_SIDE", "DESK_FRONT", "DESK_SINGLE", "PC_FRONT_OFF", "PC_FRONT_ON_1",
        "PC_FRONT_ON_2", "PC_FRONT_ON_3", "CUSHIONED_CHAIR_BACK", "CUSHIONED_CHAIR_FRONT",
        "WOODEN_CHAIR_FRONT", "BOOKSHELF", "DOUBLE_BOOKSHELF", "COFFEE", "COFFEE_TABLE",
        "SOFA_FRONT", "CUSHIONED_BENCH", "PLANT", "LARGE_PLANT", "CACTUS", "WHITEBOARD",
        "CLOCK", "SMALL_TABLE", "BIN",
    }
    data = json.loads(ATLAS_JSON.read_text())
    atlas = Image.open(ATLAS_PNG).convert("RGBA")
    out: dict[str, Image.Image] = {}
    for name in keep:
        fr = data["frames"].get(name)
        if not fr:
            continue
        f = fr["frame"]
        crop = atlas.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
        out[name] = upscale2(crop)
    return out