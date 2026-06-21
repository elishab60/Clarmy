#!/usr/bin/env python3
"""Re-process saved Grok raws into high-detail office frames + sheet.

No Grok calls: reads tmp/sprites/<c>/raw/raw-NNN.png and rebuilds frames with a
GENTLE green key (no edge eating) + interior hole-fill (kills fishnet speckles)
at the configured native resolution, NO pixelize/quantize crunch. Then assembles
the 7x3 sheet and exports a detail montage to public/office/anni-detail/.

Usage: python3 scripts/sprite/reprocess.py --character anni
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from spritecfg import get, resolve  # noqa: E402

KEY = (0, 255, 0)
KEY_TOL = 150      # L1 sum distance to pure green that counts as background
DESPILL = 22       # green-cast removal threshold on remaining edges


def strip_green(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    kr, kg, kb = KEY
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            if abs(r - kr) + abs(g - kg) + abs(b - kb) <= KEY_TOL:
                px[x, y] = (0, 0, 0, 0)
            elif g > r + DESPILL and g > b + DESPILL:
                m = (r + b) // 2
                px[x, y] = (r, m, b, a)
    return im


def fill_holes(im: Image.Image, passes: int = 3) -> Image.Image:
    """Fill transparent pixels mostly surrounded by character (fishnet gaps)."""
    px = im.load()
    w, h = im.size
    for _ in range(passes):
        fills = []
        for y in range(h):
            for x in range(w):
                if px[x, y][3] >= 24:
                    continue
                ar = ag = ab = n = 0
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h:
                            q = px[nx, ny]
                            if q[3] >= 24:
                                ar += q[0]; ag += q[1]; ab += q[2]; n += 1
                if n >= 5:
                    fills.append((x, y, (ar // n, ag // n, ab // n)))
        if not fills:
            break
        for x, y, c in fills:
            px[x, y] = (c[0], c[1], c[2], 255)
    return im


def to_native(crop: Image.Image, nw: int, nh: int, ratio: float) -> Image.Image:
    cw, ch = crop.size
    scale = min(nw / cw, nh / ch) * ratio
    tw, th = max(1, int(cw * scale)), max(1, int(ch * scale))
    scaled = crop.resize((tw, th), Image.LANCZOS)
    out = Image.new("RGBA", (nw, nh), (0, 0, 0, 0))
    out.paste(scaled, ((nw - tw) // 2, nh - th), scaled)
    return out


SEATED = {3, 4, 10, 11, 17, 18}


def process_raw(path: Path, nw: int, nh: int, ratio: float, gidx: int) -> Image.Image:
    im = strip_green(Image.open(path))
    box = im.getbbox()
    if not box:
        return Image.new("RGBA", (nw, nh), (0, 0, 0, 0))
    crop = fill_holes(im.crop(box))
    frame = to_native(crop, nw, nh, ratio)
    if gidx in SEATED:
        sh = Image.new("RGBA", frame.size, (0, 0, 0, 0))
        sh.paste(frame, (0, int(nh * 0.08)), frame)
        frame = sh
    return frame


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--character", default="anni")
    args = p.parse_args()
    c = args.character

    nw, nh = int(get("nativeWidth")), int(get("nativeHeight"))
    ratio = float(get("targetRatio", 0.88))
    cols, rows = int(get("sheetCols", 7)), int(get("sheetRows", 3))
    spec = json.loads((ROOT / "config" / f"anims-{c}.json").read_text())
    indices = [f["index"] for row in spec["rows"] for f in row["frames"]]

    raw_dir = resolve(f"tmp/sprites/{c}/raw")
    frames_dir = resolve(f"tmp/sprites/{c}/frames")
    frames_dir.mkdir(parents=True, exist_ok=True)
    detail = resolve("public/office/anni-detail")
    detail.mkdir(parents=True, exist_ok=True)

    sheet = Image.new("RGBA", (cols * nw, rows * nh), (0, 0, 0, 0))
    done = 0
    for idx in indices:
        raw = raw_dir / f"raw-{idx:03d}.png"
        if not raw.is_file():
            continue
        frame = process_raw(raw, nw, nh, ratio, idx)
        frame.save(frames_dir / f"frame-{idx:03d}.png")
        frame.save(detail / f"frame-{idx:03d}.png")
        # detail also keeps the untouched raw for side-by-side inspection
        Image.open(raw).convert("RGBA").save(detail / f"raw-{idx:03d}.png")
        col, row = idx % cols, idx // cols
        sheet.paste(frame, (col * nw, row * nh), frame)
        done += 1
        print(f"reprocessed frame-{idx:03d}", flush=True)

    out = resolve(get(f"characters.{c}.sheetOut"))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f"\n{done} frames -> {out} ({sheet.width}x{sheet.height})", flush=True)


if __name__ == "__main__":
    main()
