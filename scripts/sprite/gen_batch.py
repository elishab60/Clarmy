#!/usr/bin/env python3
"""Prepare / process one imagegen batch. Image step = Grok GenerateImage."""

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

from autofit_frame import autofit  # noqa: E402
from spritecfg import get, resolve  # noqa: E402

PER = int(get("framesPerGen", 2))


def anim_spec(character: str) -> dict:
    return json.loads((ROOT / "config" / f"anims-{character}.json").read_text())


def all_frames(character: str) -> list[dict]:
    spec = anim_spec(character)
    out: list[dict] = []
    for row in spec["rows"]:
        for f in row["frames"]:
            out.append({**f, "direction": row["direction"]})
    return sorted(out, key=lambda x: x["index"])


def direction_view(direction: str) -> str:
    return {
        "down": "front-facing toward camera",
        "up": "back view facing away from camera",
        "right": "right profile facing screen-right",
    }[direction]


def batch_dir(character: str) -> Path:
    d = resolve(f"tmp/sprites/{character}")
    d.mkdir(parents=True, exist_ok=True)
    return d


def build_prompt(character: str, frame_specs: list[dict]) -> str:
    style = get(f"characters.{character}.style")
    lines = [
        "Pixel art game character sprite strip on pure chroma green #00ff00 background.",
        "NO borders, NO grid lines, NO separators — only empty green gaps between slots.",
        f"Character style: {style}.",
        "Slot 0 (leftmost) is REFERENCE ANCHOR — match identity exactly.",
        "Generate slots 1 onward:",
    ]
    for i, fr in enumerate(frame_specs, start=1):
        view = direction_view(fr["direction"])
        lines.append(f"  Slot {i}: {view} — {fr['action']}.")
    lines += [
        "Identical palette, proportions, outfit, hair, face across all slots.",
        "Crisp pixel art, bottom-center feet, ~88% slot height.",
    ]
    return "\n".join(lines)


def pixelize(im: Image.Image, px: int = 3) -> Image.Image:
    w, h = im.size
    s = im.resize((max(1, w // px), max(1, h // px)), Image.NEAREST)
    return s.resize((w, h), Image.NEAREST)


def run_py(script: str, *args: str) -> None:
    subprocess.run([sys.executable, str(ROOT / script), *args], check=True, cwd=ROOT)


def batch_key(start_index: int) -> str:
    return f"start-{start_index:02d}"


def prepare(character: str, start_index: int) -> dict:
    frames = all_frames(character)
    batch_frames = frames[start_index : start_index + PER]
    if not batch_frames:
        raise SystemExit(f"no frames at start {start_index}")

    count = len(batch_frames)
    slots = count + 1
    key = batch_key(start_index)
    bdir = batch_dir(character)
    canvas = bdir / f"{key}-canvas.png"
    prompt_path = bdir / f"{key}-prompt.txt"
    raw_path = bdir / f"{key}-raw.png"

    run_py("build_canvas.py", "--character", character, "--slots", str(slots), "--out", str(canvas))
    prompt_path.write_text(build_prompt(character, batch_frames))

    meta = {
        "character": character,
        "batchKey": key,
        "startIndex": start_index,
        "frameIndices": [f["index"] for f in batch_frames],
        "slots": slots,
        "canvas": str(canvas.relative_to(resolve("."))),
        "prompt": str(prompt_path.relative_to(resolve("."))),
        "rawExpected": str(raw_path.relative_to(resolve("."))),
        "nativeWidth": get("nativeWidth"),
        "nativeHeight": get("nativeHeight"),
    }
    (bdir / f"{key}.meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))
    return meta


def process(character: str, start_index: int, raw: Path | None = None) -> None:
    key = batch_key(start_index)
    bdir = batch_dir(character)
    meta = json.loads((bdir / f"{key}.meta.json").read_text())
    raw_path = raw or (bdir / f"{key}-raw.png")
    if not raw_path.exists():
        raise SystemExit(f"missing raw gen: {raw_path}")

    nw, nh = int(get("nativeWidth")), int(get("nativeHeight"))
    slots = int(meta["slots"])
    norm = bdir / f"{key}-norm.png"
    run_py("normalize_raw.py", "--in", str(raw_path), "--out", str(norm), "--slots", str(slots))
    stripped = bdir / f"{key}-stripped.png"
    run_py("strip_chroma.py", "--in", str(norm), "--out", str(stripped), "--pass", "1")

    sheet = Image.open(stripped).convert("RGBA")
    frames_dir = bdir / "frames"
    frames_dir.mkdir(exist_ok=True)

    for slot, gidx in enumerate(meta["frameIndices"], start=1):
        cell = sheet.crop((slot * nw, 0, (slot + 1) * nw, nh))
        crop_path = bdir / f"{key}-slot{slot}-crop.png"
        fit = bdir / f"{key}-slot{slot}-fit.png"
        cell.save(crop_path)
        fitted = pixelize(autofit(Image.open(crop_path), "stable"), 3)
        fitted.save(fit)
        shutil.copy2(fit, frames_dir / f"frame-{gidx:03d}.png")

    print(f"processed {key} -> {frames_dir}")


def all_starts(character: str = "anni") -> list[int]:
    """Start indices per row (never cross down/up/right boundaries)."""
    starts: list[int] = []
    for row in anim_spec(character)["rows"]:
        idxs = [f["index"] for f in row["frames"]]
        base = idxs[0]
        for i in range(0, len(idxs), PER):
            starts.append(base + i)
    return starts


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=["prepare", "process", "prompt", "list"])
    p.add_argument("--character", default="anni")
    p.add_argument("--start", type=int, default=0)
    p.add_argument("--raw", default="")
    args = p.parse_args()

    if args.command == "list":
        print(all_starts(args.character))
        return
    if args.command == "prompt":
        frames = all_frames(args.character)
        print(build_prompt(args.character, frames[args.start : args.start + PER]))
        return
    if args.command == "prepare":
        prepare(args.character, args.start)
        return
    if args.command == "process":
        process(args.character, args.start, Path(args.raw) if args.raw else None)


if __name__ == "__main__":
    main()