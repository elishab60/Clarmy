#!/usr/bin/env python3
"""Crop named frames out of the packed office atlas into individual PNGs.

Used to get the current decor sprite as a style/proportion reference for the
Grok image_edit upscale, and to keep a "before" for comparison.

Usage: python3 scripts/sprite/extract_atlas_frame.py DESK_FRONT PC_FRONT_OFF ...
Output: tmp/decor/old-<NAME>.png
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    atlas = Image.open(ROOT / "public/office/atlas.png").convert("RGBA")
    frames = json.loads((ROOT / "public/office/atlas.json").read_text())["frames"]
    out = ROOT / "tmp/decor"
    out.mkdir(parents=True, exist_ok=True)
    for name in sys.argv[1:]:
        if name not in frames:
            print(f"!! {name} not in atlas")
            continue
        f = frames[name]["frame"]
        crop = atlas.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
        dst = out / f"old-{name}.png"
        crop.save(dst)
        print(f"{name}: {crop.size} -> {dst.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
