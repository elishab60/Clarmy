#!/usr/bin/env python3
"""Surgically replace/add a frame in the packed office atlas.

Appends the new image at the bottom of atlas.png (growing height) and rewrites
that frame's entry in atlas.json. Avoids the full HD rebuild, which re-upscales
every kept frame 2× each run (that is what made the assets grow). The scene
reads frame width at runtime and scales to DECOR_W, so the new size is fine.

Usage: python3 scripts/sprite/atlas_patch.py NAME path/to/new.png
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ATLAS_PNG = ROOT / "public/office/atlas.png"
ATLAS_JSON = ROOT / "public/office/atlas.json"


def patch(name: str, png: Path) -> None:
    atlas = Image.open(ATLAS_PNG).convert("RGBA")
    data = json.loads(ATLAS_JSON.read_text())
    img = Image.open(png).convert("RGBA")
    w, h = img.size

    new_h = atlas.height + h + 1
    out = Image.new("RGBA", (max(atlas.width, w), new_h), (0, 0, 0, 0))
    out.paste(atlas, (0, 0))
    y0 = atlas.height + 1
    out.paste(img, (0, y0))
    out.save(ATLAS_PNG)

    data["frames"][name] = {
        "frame": {"x": 0, "y": y0, "w": w, "h": h},
        "rotated": False,
        "trimmed": False,
        "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
        "sourceSize": {"w": w, "h": h},
    }
    data["meta"]["size"] = {"w": out.width, "h": out.height}
    ATLAS_JSON.write_text(json.dumps(data, indent=1) + "\n")
    print(f"patched {name}: {w}x{h} at y={y0} (atlas now {out.width}x{out.height})")


if __name__ == "__main__":
    patch(sys.argv[1], Path(sys.argv[2]))
