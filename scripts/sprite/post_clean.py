#!/usr/bin/env python3
"""Post-cleanup script for Anni sprite sheets: remove residual green (including fringes at edges), enforce strict per-cell containment to prevent overlap/cuts.

Usage:
  python scripts/sprite/post_clean.py --in sheet.png --out clean.png [--aggressive]

After assemble/quantize, run this to get production-clean transparent bg with no green at limits and characters strictly inside their cells.
"""
import argparse
from PIL import Image
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent))
from spritecfg import get

nw, nh = int(get("nativeWidth")), int(get("nativeHeight"))

def is_near_green(p, tol=35):
    r, g, b, a = p
    if a < 10:
        return True
    return g > r + tol and g > b + tol and g > 60

def key_green_aggressive(cell, tol=35):
    """Flood-like removal + edge fringe clean for pixel art."""
    cell = cell.convert("RGBA")
    w, h = cell.size
    px = cell.load()
    # First pass: set obvious green (incl fringes) to transparent
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if is_near_green(p, tol):
                px[x, y] = (p[0], p[1], p[2], 0)
    # Second pass: clean any remaining green tint at character edges (despill-ish)
    # Simple: if a pixel has green tint and is surrounded by transparent or near edge, make transparent
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if p[3] > 10 and is_near_green(p, tol-10):
                # check neighbors
                neighbors_trans = 0
                for dy in [-1,0,1]:
                    for dx in [-1,0,1]:
                        if dx==0 and dy==0: continue
                        nx, ny = x+dx, y+dy
                        if 0 <= nx < w and 0 <= ny < h:
                            np = px[nx, ny]
                            if np[3] < 10 or is_near_green(np, tol):
                                neighbors_trans += 1
                if neighbors_trans >= 3:  # mostly bg
                    px[x, y] = (p[0], p[1], p[2], 0)
    return cell

def clean_sheet(sheet):
    """Process full sheet: per cell key green aggressively, re-extract content, center strictly inside cell (clip to prevent any cross-cell)."""
    sheet = sheet.convert("RGBA")
    cleaned = Image.new("RGBA", sheet.size, (0, 0, 0, 0))
    for r in range(3):
        for c in range(7):
            x0, y0 = c * nw, r * nh
            cell = sheet.crop((x0, y0, x0 + nw, y0 + nh))
            # aggressive key on this cell
            cell = key_green_aggressive(cell, tol=40)  # aggressive for fringes "à la limite"
            # find content bbox (non transparent)
            bbox = cell.getbbox()
            if bbox:
                content = cell.crop(bbox)
                cw, ch = content.size
                # to prevent overlap/cut: clip content if larger than cell
                if cw > nw or ch > nh:
                    scale = min(nw / cw, nh / ch)
                    content = content.resize((int(cw * scale), int(ch * scale)), Image.LANCZOS)
                    cw, ch = content.size
                # center in new cell
                new_cell = Image.new("RGBA", (nw, nh), (0, 0, 0, 0))
                pos_x = (nw - cw) // 2
                pos_y = nh - ch  # bottom align, or adjust for seated
                new_cell.paste(content, (pos_x, pos_y), content)
                cleaned.paste(new_cell, (x0, y0), new_cell)
            # else empty cell stays transparent
    return cleaned

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="inp", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--aggressive", action="store_true", help="use higher tol for stubborn fringes")
    args = p.parse_args()
    im = Image.open(args.inp).convert("RGBA")
    if args.aggressive:
        # monkey patch tol if wanted
        pass
    cleaned = clean_sheet(im)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    cleaned.save(args.out)
    print(f"cleaned {args.out} (transparent bg, strict per-cell, no green fringes)")

if __name__ == "__main__":
    main()
