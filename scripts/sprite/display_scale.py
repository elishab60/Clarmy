#!/usr/bin/env python3
"""Compute Phaser displayScale: native frame occupies same tile footprint as legacy."""

from __future__ import annotations

import sys

from spritecfg import get


def compute() -> float:
    lw = int(get("legacyFrame.width", 16))
    lh = int(get("legacyFrame.height", 32))
    ls = float(get("legacyFrame.displayScale", 1.35))
    nw = int(get("nativeWidth"))
    nh = int(get("nativeHeight"))
    # Uniform scale: match legacy visual height (dominant for top-down office).
    return round(lh * ls / nh, 6)


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "--ts":
        nw, nh = int(get("nativeWidth")), int(get("nativeHeight"))
        s = compute()
        print(f"grok: {{ frameWidth: {nw}, frameHeight: {nh}, displayScale: {s} }},")
        return
    print(compute())


if __name__ == "__main__":
    main()