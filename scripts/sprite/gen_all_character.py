#!/usr/bin/env python3
"""Prepare all batches; process those with raw PNG present; assemble sheet."""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

spec = importlib.util.spec_from_file_location("gen_batch", ROOT / "gen_batch.py")
gb = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(gb)

from spritecfg import resolve  # noqa: E402


def main() -> None:
    char = sys.argv[1] if len(sys.argv) > 1 else "anni"
    mode = sys.argv[2] if len(sys.argv) > 2 else "prepare-all"

    starts = gb.all_starts(char)
    bdir = resolve(f"tmp/sprites/{char}")

    if mode in ("prepare-all", "all"):
        for s in starts:
            print(f"\n=== prepare start={s} ===")
            gb.prepare(char, s)

    if mode in ("process-all", "all"):
        for s in starts:
            raw = bdir / f"{gb.batch_key(s)}-raw.png"
            if not raw.exists():
                print(f"skip start={s}: missing {raw.name}")
                continue
            print(f"\n=== process start={s} ===")
            gb.process(char, s)

    if mode in ("assemble", "all"):
        frames = bdir / "frames"
        subprocess.run(
            [sys.executable, str(ROOT / "assemble_sheet.py"), "--character", char, "--frames-dir", str(frames)],
            check=True,
            cwd=ROOT,
        )
        from spritecfg import get
        out = resolve(get(f"characters.{char}.sheetOut"))
        subprocess.run(
            [sys.executable, str(ROOT / "quantize_palette.py"), "--character", char, "--in", str(out), "--out", str(out)],
            check=True,
            cwd=ROOT,
        )
        subprocess.run(
            [sys.executable, str(ROOT / "strip_chroma.py"), "--in", str(out), "--out", str(out), "--pass", "2"],
            check=True,
            cwd=ROOT,
        )
        subprocess.run(
            [sys.executable, str(ROOT / "audit_sprite.py"), "--frames-dir", str(frames)],
            check=True,
            cwd=ROOT,
        )
        print(f"done {out}")


if __name__ == "__main__":
    main()