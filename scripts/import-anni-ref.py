#!/usr/bin/env python3
"""Downscale Anni refs into GROK palette pixels — preview + optional sheet patch."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
REFS = ROOT / "refs" / "anni"
OUT = ROOT / "public" / "office" / "characters"
PREVIEW = ROOT / "refs" / "anni" / "preview"

# Must match gen-agent-sprites.py GROK palette
GROK_PALETTE: dict[str, str] = {
    "H": "#E8C848", "h": "#FFF0A0", "t": "#1A1018", "E": "#F8FCFF", "B": "#3A88E8",
    "S": "#F8D0C0", "F": "#E8B0A0", "M": "#E87898", "T": "#141018", "L": "#2A2838",
    "K": "#9B7CFF", "J": "#C84868", "n": "#4A4068", "b": "#141018", "P": "#EDE9E0",
    "d": "#0A0810", "l": "#0A0810", "W": "#C9A84C", "G": "#A07830", "C": "#EDE9E0",
}

FRAME_W, FRAME_H = 32, 64


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def palette_colors() -> list[tuple[int, int, int]]:
    return [hex_rgb(v) for v in GROK_PALETTE.values()]


def trim_alpha(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    box = im.getbbox()
    return im.crop(box) if box else im


def ref_to_pixel(im: Image.Image, fw: int = FRAME_W, fh: int = FRAME_H) -> Image.Image:
    """Area-sample ref into a fixed grid, snap each cell to nearest GROK palette color."""
    im = trim_alpha(im)
    lw, lh = im.size
    sample = im.resize((fw, fh), Image.LANCZOS)
    pal = palette_colors()
    out = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    spx = sample.load()
    opx = out.load()
    for y in range(fh):
        for x in range(fw):
            r, g, b, a = spx[x, y]
            if a < 40:
                continue
            best = min(pal, key=lambda c: (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2)
            opx[x, y] = (*best, 255)
    return out


def paste_frame(sheet: Image.Image, frame: Image.Image, col: int, row: int) -> None:
    sheet.paste(frame, (col * FRAME_W, row * FRAME_H), frame)


def main() -> None:
    ref = REFS / "ref2.png"
    if len(sys.argv) > 1:
        ref = Path(sys.argv[1])
    if not ref.exists():
        raise SystemExit(f"missing ref: {ref}")

    PREVIEW.mkdir(parents=True, exist_ok=True)
    px = ref_to_pixel(Image.open(ref))
    px.save(PREVIEW / "anni-ref2-quantized.png")
    print(f"wrote {PREVIEW / 'anni-ref2-quantized.png'}")

    sheet_path = OUT / "agent_grok.png"
    if sheet_path.exists():
        sheet = Image.open(sheet_path).convert("RGBA")
        # Replace front idle frame (col 1 = walk N, row 0 = down)
        paste_frame(sheet, px, 1, 0)
        sheet.save(sheet_path)
        print(f"patched idle frame into {sheet_path}")


if __name__ == "__main__":
    main()