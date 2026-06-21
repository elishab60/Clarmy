#!/usr/bin/env python3
"""Assemble indexed frames into Phaser office sheet (7×3 grid)."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

from spritecfg import get, resolve


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--character", required=True)
    p.add_argument("--frames-dir", required=True)
    p.add_argument("--out", default="")
    args = p.parse_args()

    cols, rows = get("sheetCols"), get("sheetRows")
    nw, nh = int(get("nativeWidth")), int(get("nativeHeight"))
    frames_dir = Path(args.frames_dir)
    out = Path(args.out) if args.out else resolve(get(f"characters.{args.character}.sheetOut"))

    spec = json.loads((Path(__file__).parent / "config" / f"anims-{args.character}.json").read_text())
    indices = [f["index"] for row in spec["rows"] for f in row["frames"]]

    # Native = storage; Phaser displayScale shrinks to legacy 16×32 footprint.
    sheet = Image.new("RGBA", (cols * nw, rows * nh), (0, 0, 0, 0))
    for idx in indices:
        src = frames_dir / f"frame-{idx:03d}.png"
        if not src.exists():
            continue
        cell = Image.open(src).convert("RGBA")
        if cell.size != (nw, nh):
            cell = cell.resize((nw, nh), Image.LANCZOS)
        col, row = idx % cols, idx // cols
        sheet.paste(cell, (col * nw, row * nh), cell)

    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f"assembled {out} ({sheet.width}×{sheet.height})")


if __name__ == "__main__":
    main()