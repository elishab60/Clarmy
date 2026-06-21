#!/usr/bin/env python3
"""Read scripts/sprite/config/sprite.json — single source of truth."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent.parent
CFG_PATH = Path(__file__).resolve().parent / "config" / "sprite.json"
_cache: dict[str, Any] | None = None


def load() -> dict[str, Any]:
    global _cache
    if _cache is None:
        _cache = json.loads(CFG_PATH.read_text())
    return _cache


def get(path: str, default: Any = None) -> Any:
    cur: Any = load()
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return default
        cur = cur[part]
    return cur


def root() -> Path:
    return ROOT


def resolve(rel: str) -> Path:
    return ROOT / rel


def main() -> None:
    if len(sys.argv) < 2:
        print(CFG_PATH)
        return
    val = get(sys.argv[1])
    if val is None:
        sys.exit(1)
    print(val)


if __name__ == "__main__":
    main()