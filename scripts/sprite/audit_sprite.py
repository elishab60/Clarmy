#!/usr/bin/env python3
"""QA: empty frames, bbox centering, chroma leaks."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

from lib.sprite_io import chroma_key, find_bbox
from spritecfg import get


def audit_frame(path: Path) -> list[str]:
    issues: list[str] = []
    im = Image.open(path).convert("RGBA")
    if find_bbox(im) is None:
        issues.append("empty")
        return issues
    kr, kg, kb = chroma_key()
    green = sum(1 for r, g, b, a in im.getdata() if a > 20 and abs(r - kr) + abs(g - kg) + abs(b - kb) < 40)
    if green > 12:
        issues.append(f"chroma_leak={green}")
    box = find_bbox(im)
    if box:
        cx = (box[0] + box[2]) / 2
        if abs(cx - im.width / 2) > im.width * 0.12:
            issues.append(f"off_center={cx:.0f}")
    return issues


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--frames-dir", required=True)
    args = p.parse_args()
    d = Path(args.frames_dir)
    bad = 0
    for fp in sorted(d.glob("frame-*.png")):
        issues = audit_frame(fp)
        if issues:
            bad += 1
            print(f"{fp.name}: {', '.join(issues)}")
    if bad:
        sys.exit(1)
    print(f"audit ok ({len(list(d.glob('frame-*.png')))} frames)")


if __name__ == "__main__":
    main()