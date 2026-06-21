#!/usr/bin/env python3
"""Lock shared palette across frames (sampled from reference PNG)."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

from spritecfg import get, resolve


def sample_palette(ref: Image.Image, n: int) -> list[tuple[int, int, int]]:
    ref = ref.convert("RGBA").resize((64, 64), Image.LANCZOS)
    colors: dict[tuple[int, int, int], int] = {}
    for r, g, b, a in ref.getdata():
        if a < 40:
            continue
        q = (r // 8 * 8, g // 8 * 8, b // 8 * 8)
        colors[q] = colors.get(q, 0) + 1
    ranked = sorted(colors.items(), key=lambda kv: -kv[1])
    return [c for c, _ in ranked[: max(n, 8)]]


def quantize(im: Image.Image, palette: list[tuple[int, int, int]]) -> Image.Image:
    im = im.convert("RGBA")
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    spx, opx = im.load(), out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = spx[x, y]
            if a < 24:
                continue
            best = min(palette, key=lambda c: (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2)
            opx[x, y] = (*best, a)
    return out


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--character", required=True)
    p.add_argument("--in", dest="inp", required=True)
    p.add_argument("--out", required=True)
    args = p.parse_args()
    ref_path = resolve(get(f"characters.{args.character}.paletteFrom"))
    n = int(get(f"characters.{args.character}.paletteColors", 32))
    pal = sample_palette(Image.open(ref_path), n)
    im = Image.open(args.inp)
    if im.width > get("nativeWidth"):
        # full sheet: quantize each frame cell
        nw, nh = get("nativeWidth"), get("nativeHeight")
        out = Image.new("RGBA", im.size, (0, 0, 0, 0))
        for y in range(0, im.height, nh):
            for x in range(0, im.width, nw):
                cell = im.crop((x, y, x + nw, y + nh))
                out.paste(quantize(cell, pal), (x, y))
        im = out
    else:
        im = quantize(im, pal)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    im.save(args.out)


if __name__ == "__main__":
    main()