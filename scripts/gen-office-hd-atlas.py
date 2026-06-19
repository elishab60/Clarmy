#!/usr/bin/env python3
"""Rebuild public/office/atlas at 2× resolution (32px tiles, 64px tall props)."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from office_hd_decor import all_decor
from office_hd_posters import all_posters
from office_hd_tiles import all_tiles
from office_hd_util import OUT_DIR, load_upscaled_furniture, save_atlas


def main() -> None:
    frames: dict = {}
    print("upscaling legacy furniture 2×…")
    frames.update(load_upscaled_furniture())
    print("drawing HD floors + walls…")
    frames.update(all_tiles())
    print("drawing HD themed decor…")
    frames.update(all_decor())
    print("composing logo posters 64×128…")
    posters = all_posters()
    frames.update(posters)
    for name, im in posters.items():
        im.save(OUT_DIR / f"{name.lower()}.png")
    save_atlas(frames)
    print("done — scene uses displayScale 0.5")


if __name__ == "__main__":
    main()