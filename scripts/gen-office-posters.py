#!/usr/bin/env python3
"""Compose Chinese-AI wall posters from refs/posters/*.png into the office atlas.

Output frames: POSTER_DEEPSEEK, POSTER_QWEN, POSTER_KIMI @ 32×64 (2× legacy).
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
REFS = ROOT / "refs" / "posters"
OUT_DIR = ROOT / "public" / "office"
ATLAS_PNG = OUT_DIR / "atlas.png"
ATLAS_JSON = OUT_DIR / "atlas.json"

POSTER_W, POSTER_H = 32, 64

POSTERS: list[tuple[str, str]] = [
    ("POSTER_DEEPSEEK", "deepseek.png"),
    ("POSTER_QWEN", "qwen.png"),
    ("POSTER_KIMI", "kimi.png"),
]


def hex_rgb(h: str) -> tuple[int, int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def trim_alpha(im: Image.Image) -> Image.Image:
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    box = im.getbbox()
    return im.crop(box) if box else im


def fit_logo(logo: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    x0, y0, x1, y1 = box
    tw, th = x1 - x0, y1 - y0
    logo = trim_alpha(logo)
    lw, lh = logo.size
    scale = min(tw / lw, th / lh)
    nw, nh = max(1, int(lw * scale)), max(1, int(lh * scale))
    scaled = logo.resize((nw, nh), Image.LANCZOS)
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    ox = (tw - nw) // 2
    oy = (th - nh) // 2
    out.paste(scaled, (ox, oy), scaled)
    return out


def compose_poster(logo_path: Path, accent: str) -> Image.Image:
    poster = Image.new("RGBA", (POSTER_W, POSTER_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(poster)

    # Wooden frame + wall shadow
    d.rectangle((0, 2, POSTER_W - 1, POSTER_H - 1), fill=hex_rgb("#3D2E22"))
    d.rectangle((1, 3, POSTER_W - 2, POSTER_H - 2), fill=hex_rgb("#5A4030"))
    d.rectangle((2, 4, POSTER_W - 3, POSTER_H - 3), fill=hex_rgb("#2B2926"))

    # Mat / paper
    d.rectangle((3, 6, POSTER_W - 4, POSTER_H - 5), fill=hex_rgb("#F5F2EC"))
    d.rectangle((3, 6, POSTER_W - 4, POSTER_H - 5), outline=hex_rgb(accent), width=1)

    # Nail
    d.ellipse((14, 3, 18, 7), fill=hex_rgb("#8A857C"))
    d.point((16, 4), fill=hex_rgb("#EDE9E0"))

    logo = fit_logo(Image.open(logo_path), (4, 8, POSTER_W - 5, 46))
    poster.alpha_composite(logo, (4, 8))

    # Subtle brand strip
    d.rectangle((5, 48, POSTER_W - 6, 54), fill=hex_rgb(accent))
    d.rectangle((6, 49, POSTER_W - 7, 53), fill=hex_rgb("#1A1816"))

    return poster


def remove_frames(entries: dict, names: set[str]) -> None:
    for name in names:
        entries.pop(name, None)


def grow_atlas(atlas: Image.Image, need_h: int) -> Image.Image:
    if need_h <= atlas.height:
        return atlas
    h2 = 1 << math.ceil(math.log2(max(need_h, 1)))
    grown = Image.new("RGBA", (atlas.width, h2), (0, 0, 0, 0))
    grown.paste(atlas, (0, 0))
    return grown


def pack_posters(atlas: Image.Image, entries: dict, frames: dict[str, Image.Image]) -> Image.Image:
    remove_frames(entries, set(frames))
    pad = 1
    max_w = atlas.width
    max_y = max((f["y"] + f["h"] for f in (m["frame"] for m in entries.values())), default=0)
    x, y, shelf_h = 0, max_y + pad, 0

    # Pre-grow so paste coords are never off-canvas (PIL silently clips otherwise).
    tallest = max(im.height for im in frames.values())
    atlas = grow_atlas(atlas, y + tallest)

    for name in sorted(frames):
        im = frames[name]
        w, h = im.size
        if x + w + pad > max_w:
            x, y, shelf_h = 0, y + shelf_h + pad, 0
            atlas = grow_atlas(atlas, y + h)
        atlas.paste(im, (x, y))
        entries[name] = {
            "frame": {"x": x, "y": y, "w": w, "h": h},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
            "sourceSize": {"w": w, "h": h},
        }
        x += w + pad
        shelf_h = max(shelf_h, h)

    atlas = grow_atlas(atlas, y + shelf_h)
    return atlas


def main() -> None:
    accents = {
        "POSTER_DEEPSEEK": "#4796E3",
        "POSTER_QWEN": "#9B7CFF",
        "POSTER_KIMI": "#1A1A1A",
    }
    composed: dict[str, Image.Image] = {}
    for frame_name, filename in POSTERS:
        src = REFS / filename
        if not src.exists():
            raise SystemExit(f"missing ref: {src}")
        composed[frame_name] = compose_poster(src, accents[frame_name])
        composed[frame_name].save(OUT_DIR / f"{frame_name.lower()}.png")
        print(f"composed {frame_name} from {filename}")

    data = json.loads(ATLAS_JSON.read_text())
    atlas = Image.open(ATLAS_PNG).convert("RGBA")
    atlas = pack_posters(atlas, data["frames"], composed)
    atlas.save(ATLAS_PNG)
    data["meta"]["size"]["h"] = atlas.height
    ATLAS_JSON.write_text(json.dumps(data, indent=1) + "\n")
    print(f"atlas patched ({POSTER_W}×{POSTER_H}) -> {ATLAS_PNG}")


if __name__ == "__main__":
    main()