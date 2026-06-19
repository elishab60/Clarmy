#!/usr/bin/env python3
"""Resize arbitrary GenerateImage output to exact batch strip dimensions."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

from spritecfg import get


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="inp", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--slots", type=int, required=True)
    args = p.parse_args()
    nw, nh = get("nativeWidth"), get("nativeHeight")
    target = (nw * args.slots, nh)
    im = Image.open(args.inp).convert("RGBA")
    if im.size != target:
        im = im.resize(target, Image.LANCZOS)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    im.save(args.out)
    print(f"normalized {args.inp} -> {target}")


if __name__ == "__main__":
    main()