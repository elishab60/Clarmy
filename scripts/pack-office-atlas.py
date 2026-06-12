#!/usr/bin/env python3
"""Pack the office decor (floors, wall pieces, furniture) into one Phaser
atlas: public/office/atlas.png + atlas.json. Characters stay as per-palette
spritesheets (they are already atlases of 21 frames).

Source assets come from pixel-agents (MIT) - see CREDITS.md. Run from the repo
root after dropping new pieces into /tmp/office-refs/pixel-agents (dev-time
only; the generated atlas is committed, the script needs the clone only when
regenerating).
"""

import json
import math
import sys
from pathlib import Path

from PIL import Image

SRC = Path("/tmp/office-refs/pixel-agents/webview-ui/public/assets")
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "office"

# Furniture pieces the office layout uses (asset id -> file inside its folder).
FURNITURE = {
    "DESK_FRONT": "DESK/DESK_FRONT.png",
    "DESK_SIDE": "DESK/DESK_SIDE.png",
    "PC_FRONT_ON_1": "PC/PC_FRONT_ON_1.png",
    "PC_FRONT_ON_2": "PC/PC_FRONT_ON_2.png",
    "PC_FRONT_ON_3": "PC/PC_FRONT_ON_3.png",
    "PC_FRONT_OFF": "PC/PC_FRONT_OFF.png",
    "CUSHIONED_CHAIR_FRONT": "CUSHIONED_CHAIR/CUSHIONED_CHAIR_FRONT.png",
    "CUSHIONED_CHAIR_BACK": "CUSHIONED_CHAIR/CUSHIONED_CHAIR_BACK.png",
    "WOODEN_CHAIR_FRONT": "WOODEN_CHAIR/WOODEN_CHAIR_FRONT.png",
    "BOOKSHELF": "BOOKSHELF/BOOKSHELF.png",
    "DOUBLE_BOOKSHELF": "DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF.png",
    "COFFEE": "COFFEE/COFFEE.png",
    "COFFEE_TABLE": "COFFEE_TABLE/COFFEE_TABLE.png",
    "SOFA_FRONT": "SOFA/SOFA_FRONT.png",
    "CUSHIONED_BENCH": "CUSHIONED_BENCH/CUSHIONED_BENCH.png",
    "PLANT": "PLANT/PLANT.png",
    "LARGE_PLANT": "LARGE_PLANT/LARGE_PLANT.png",
    "CACTUS": "CACTUS/CACTUS.png",
    "WHITEBOARD": "WHITEBOARD/WHITEBOARD.png",
    "CLOCK": "CLOCK/CLOCK.png",
    "SMALL_TABLE": "SMALL_TABLE/SMALL_TABLE_FRONT.png",
    "BIN": "BIN/BIN.png",
}

FLOORS = [f"floor_{i}" for i in range(9)]
WALL_PIECE_W, WALL_PIECE_H, WALL_COLS = 16, 32, 4


def collect() -> list[tuple[str, Image.Image]]:
    frames: list[tuple[str, Image.Image]] = []
    for name in FLOORS:
        frames.append((name, Image.open(SRC / "floors" / f"{name}.png").convert("RGBA")))
    # wall_0.png is a 4x4 bitmask grid of 16x32 pieces; slice into wall_0..15
    wall = Image.open(SRC / "walls" / "wall_0.png").convert("RGBA")
    for mask in range(16):
        col, row = mask % WALL_COLS, mask // WALL_COLS
        box = (col * WALL_PIECE_W, row * WALL_PIECE_H, (col + 1) * WALL_PIECE_W, (row + 1) * WALL_PIECE_H)
        frames.append((f"wall_{mask}", wall.crop(box)))
    for key, rel in FURNITURE.items():
        p = SRC / "furniture" / rel
        if not p.exists():
            sys.exit(f"missing furniture asset: {p}")
        frames.append((key, Image.open(p).convert("RGBA")))
    return frames


def pack(frames: list[tuple[str, Image.Image]]) -> None:
    # simple shelf packer, 1px padding to avoid bleeding
    pad = 1
    max_w = 512
    x = y = shelf_h = 0
    placed: list[tuple[str, Image.Image, int, int]] = []
    for name, im in sorted(frames, key=lambda f: -f[1].height):
        w, h = im.size
        if x + w + pad > max_w:
            x = 0
            y += shelf_h + pad
            shelf_h = 0
        placed.append((name, im, x, y))
        x += w + pad
        shelf_h = max(shelf_h, h)
    height = y + shelf_h
    atlas = Image.new("RGBA", (max_w, 1 << math.ceil(math.log2(max(height, 1)))), (0, 0, 0, 0))
    entries = {}
    for name, im, px, py in placed:
        atlas.paste(im, (px, py))
        entries[name] = {
            "frame": {"x": px, "y": py, "w": im.width, "h": im.height},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": im.width, "h": im.height},
            "sourceSize": {"w": im.width, "h": im.height},
        }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT_DIR / "atlas.png")
    (OUT_DIR / "atlas.json").write_text(json.dumps({
        "frames": entries,
        "meta": {"image": "atlas.png", "size": {"w": atlas.width, "h": atlas.height}, "scale": "1"},
    }, indent=1) + "\n")
    print(f"atlas: {atlas.width}x{atlas.height}, {len(entries)} frames -> {OUT_DIR}")


if __name__ == "__main__":
    pack(collect())
