#!/usr/bin/env python3
"""Repack the office atlas from the pre-append backup + HD decor overrides.

atlas_patch appended frames past y=16384 (the WebGL max texture height the atlas
was already at) → those frames render black. This rebuilds ONE compact atlas:
each frame uses public/office/decor-hd/<NAME>.png when present, else the original
crop from tmp/atlas-backup.*. HD frames are small, so the result is well under
16384. Frame widths change, but scene.ts decorScale() reads width at runtime.
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from office_hd_util import pack_frames  # noqa: E402

DECOR_HD = ROOT / "public/office/decor-hd"
BASE_PNG = ROOT / "tmp/atlas-backup.png"
BASE_JSON = ROOT / "tmp/atlas-backup.json"
OUT_PNG = ROOT / "public/office/atlas.png"
OUT_JSON = ROOT / "public/office/atlas.json"


def main() -> None:
    atlas = Image.open(BASE_PNG).convert("RGBA")
    data = json.loads(BASE_JSON.read_text())
    frames: dict[str, Image.Image] = {}
    swapped = 0
    for name, entry in data["frames"].items():
        hd = DECOR_HD / f"{name}.png"
        if hd.is_file():
            frames[name] = Image.open(hd).convert("RGBA")
            swapped += 1
        else:
            f = entry["frame"]
            frames[name] = atlas.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))

    packed, entries = pack_frames(frames, max_w=512)
    if packed.height > 16000:
        packed, entries = pack_frames(frames, max_w=1024)

    packed.save(OUT_PNG)
    payload = {
        "frames": entries,
        "meta": {
            "image": "atlas.png",
            "size": {"w": packed.width, "h": packed.height},
            "scale": "2",
            "displayScale": "0.5",
        },
    }
    OUT_JSON.write_text(json.dumps(payload, indent=1) + "\n")
    print(f"repacked {packed.width}x{packed.height}, {len(entries)} frames ({swapped} HD)")


if __name__ == "__main__":
    main()
