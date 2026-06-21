#!/usr/bin/env python3
"""Add DESK_SINGLE (16×32) to the office atlas — one workstation, not the 48px triple."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "office"
ATLAS_PATH = OUT / "atlas.png"
JSON_PATH = OUT / "atlas.json"


def main() -> None:
    data = json.loads(JSON_PATH.read_text())
    atlas = Image.open(ATLAS_PATH).convert("RGBA")
    desk = data["frames"]["DESK_FRONT"]["frame"]
    full = atlas.crop((desk["x"], desk["y"], desk["x"] + desk["w"], desk["y"] + desk["h"]))
    single = full.crop((16, 0, 32, 32))

    pad = 1
    px, py = 0, atlas.height
    for name, fr in data["frames"].items():
        bottom = fr["frame"]["y"] + fr["frame"]["h"]
        if bottom > py:
            py = bottom
    py += pad

    atlas.paste(single, (px, py))
    new_h = py + single.height
    if new_h > atlas.height:
        grown = Image.new("RGBA", (atlas.width, new_h), (0, 0, 0, 0))
        grown.paste(atlas, (0, 0))
        atlas = grown

    data["frames"]["DESK_SINGLE"] = {
        "frame": {"x": px, "y": py, "w": 16, "h": 32},
        "rotated": False,
        "trimmed": False,
        "spriteSourceSize": {"x": 0, "y": 0, "w": 16, "h": 32},
        "sourceSize": {"w": 16, "h": 32},
    }
    data["meta"]["size"]["h"] = atlas.height

    atlas.save(ATLAS_PATH)
    JSON_PATH.write_text(json.dumps(data, indent=1) + "\n")
    print(f"DESK_SINGLE @ ({px},{py}) — atlas now {atlas.width}×{atlas.height}")


if __name__ == "__main__":
    main()