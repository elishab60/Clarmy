#!/usr/bin/env python3
"""Autofit one frame: bbox crop, bottom-center anchor, scale to native size."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

from lib.sprite_io import find_bbox
from spritecfg import get


def autofit(im: Image.Image, mode: str = "stable") -> Image.Image:
    nw, nh = get("nativeWidth"), get("nativeHeight")
    ratio = get("targetRatio", 0.88)
    im = im.convert("RGBA")
    box = find_bbox(im)
    if not box:
        return Image.new("RGBA", (nw, nh), (0, 0, 0, 0))
    crop = im.crop(box)
    cw, ch = crop.size
    scale = min(nw / cw, nh / ch) * ratio if mode != "raw-slot" else 1.0
    tw, th = max(1, int(cw * scale)), max(1, int(ch * scale))
    scaled = crop.resize((tw, th), Image.LANCZOS)
    out = Image.new("RGBA", (nw, nh), (0, 0, 0, 0))
    out.paste(scaled, ((nw - tw) // 2, nh - th))
    return out


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="inp", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--mode", default="stable")
    args = p.parse_args()
    out = autofit(Image.open(args.inp), args.mode)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    out.save(args.out)


if __name__ == "__main__":
    main()