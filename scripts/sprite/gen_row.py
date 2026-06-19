#!/usr/bin/env python3
"""Generate one full sheet row (7 frames + anchor) via single imagegen strip."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from autofit_frame import autofit
from gen_batch import batch_dir, build_prompt, direction_view, pixelize
from spritecfg import get, resolve


def row_frames(character: str, direction: str) -> list[dict]:
    spec = json.loads((ROOT / "config" / f"anims-{character}.json").read_text())
    for row in spec["rows"]:
        if row["direction"] == direction:
            return [{**f, "direction": direction} for f in row["frames"]]
    raise SystemExit(f"unknown direction: {direction}")


def build_row_prompt(character: str, direction: str) -> str:
    frames = row_frames(character, direction)
    style = get(f"characters.{character}.style")
    view = direction_view(direction)
    lines = [
        "Pixel art game character sprite strip, exactly 8 equal vertical slots side by side on pure chroma green #00ff00.",
        "NO borders, NO grid lines — only green gaps between slots.",
        f"Character style: {style}.",
        "Slot 0: REFERENCE ANCHOR — match identity from anchor.",
        f"Slots 1-7: {view}, one pose per slot:",
    ]
    for i, fr in enumerate(frames, start=1):
        lines.append(f"  Slot {i}: {fr['action']}.")
    lines += [
        "Identical palette, proportions, outfit across all slots. Crisp pixel art, feet bottom-center.",
    ]
    return "\n".join(lines)


def run_py(script: str, *args: str) -> None:
    subprocess.run([sys.executable, str(ROOT / script), *args], check=True, cwd=ROOT)


def prepare(character: str, direction: str) -> Path:
    slots = 8
    bdir = batch_dir(character)
    key = f"row-{direction}"
    canvas = bdir / f"{key}-canvas.png"
    prompt = bdir / f"{key}-prompt.txt"
    run_py("build_canvas.py", "--character", character, "--slots", str(slots), "--out", str(canvas))
    prompt.write_text(build_row_prompt(character, direction))
    meta = {"direction": direction, "slots": slots, "frameIndices": [f["index"] for f in row_frames(character, direction)]}
    (bdir / f"{key}.meta.json").write_text(json.dumps(meta, indent=2))
    print(prompt.read_text())
    return prompt


def process(character: str, direction: str) -> None:
    bdir = batch_dir(character)
    key = f"row-{direction}"
    raw = bdir / f"{key}-raw.png"
    if not raw.exists():
        raise SystemExit(f"missing {raw}")
    nw, nh = int(get("nativeWidth")), int(get("nativeHeight"))
    norm = bdir / f"{key}-norm.png"
    run_py("normalize_raw.py", "--in", str(raw), "--out", str(norm), "--slots", "8")
    stripped = bdir / f"{key}-stripped.png"
    run_py("strip_chroma.py", "--in", str(norm), "--out", str(stripped), "--pass", "1")
    sheet = Image.open(stripped).convert("RGBA")
    meta = json.loads((bdir / f"{key}.meta.json").read_text())
    frames_dir = bdir / "frames"
    frames_dir.mkdir(exist_ok=True)
    for slot, gidx in enumerate(meta["frameIndices"], start=1):
        cell = sheet.crop((slot * nw, 0, (slot + 1) * nw, nh))
        fit = pixelize(autofit(cell, "stable"), 3)
        fit.save(frames_dir / f"frame-{gidx:03d}.png")
    print(f"row {direction} -> {len(meta['frameIndices'])} frames")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("cmd", choices=["prepare", "process", "prompt"])
    p.add_argument("--character", default="anni")
    p.add_argument("--direction", required=True)
    args = p.parse_args()
    if args.cmd == "prompt":
        print(build_row_prompt(args.character, args.direction))
        return
    if args.cmd == "prepare":
        prepare(args.character, args.direction)
        return
    process(args.character, args.direction)


if __name__ == "__main__":
    main()