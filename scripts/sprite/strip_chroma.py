#!/usr/bin/env python3
"""Remove chroma-green background; tolerance configurable per pass."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

from lib.sprite_io import chroma_key
from spritecfg import get


def strip(im: Image.Image, tolerance: int) -> Image.Image:
    im = im.convert("RGBA")
    kr, kg, kb = chroma_key()
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            if abs(r - kr) + abs(g - kg) + abs(b - kb) <= tolerance * 3:
                px[x, y] = (0, 0, 0, 0)
    return im


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="inp", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--pass", dest="pass_name", choices=["1", "2"], default="1")
    args = p.parse_args()
    tol = get("chroma.tolerancePass1" if args.pass_name == "1" else "chroma.tolerancePass2", 28)
    out = strip(Image.open(args.inp), int(tol))
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    out.save(args.out)


if __name__ == "__main__":
    main()