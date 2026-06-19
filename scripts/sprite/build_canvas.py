#!/usr/bin/env python3
"""Build chroma-green batch canvas: slot 0 = seed anchor, slots 1+ = targets."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

from lib.sprite_io import chroma_key, trim_alpha
from spritecfg import get, resolve


def build(seed_path: Path, slots: int, out: Path) -> None:
    sw, sh = get("nativeWidth"), get("nativeHeight")
    key = chroma_key()
    canvas = Image.new("RGB", (sw * slots, sh), key)
    seed = trim_alpha(Image.open(seed_path).convert("RGBA"))
    lw, lh = seed.size
    scale = min(sw / lw, sh / lh) * get("targetRatio", 0.88)
    nw, nh = max(1, int(lw * scale)), max(1, int(lh * scale))
    scaled = seed.resize((nw, nh), Image.LANCZOS)
    slot = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    slot.paste(scaled, ((sw - nw) // 2, sh - nh), scaled)
    canvas.paste(slot, (0, 0), slot)
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--character", required=True)
    p.add_argument("--slots", type=int, required=True)
    p.add_argument("--out", required=True)
    args = p.parse_args()
    seed = resolve(get(f"characters.{args.character}.seed"))
    build(seed, args.slots, Path(args.out))


if __name__ == "__main__":
    main()