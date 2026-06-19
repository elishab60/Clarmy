#!/usr/bin/env python3
"""Per-frame office sprite generation via Grok image_edit (identity-stable).

One pose = one image_edit call from a clean identity seed. Avoids the multi-slot
strip layout that made the old batched approach drift/garble. Each raw is green-
keyed, autofit to native, pixelized, saved as frame-NNN.png. Assemble separately
with gen_office_sheet.sh.

Usage:
  python3 scripts/sprite/gen_grok.py --character anni --row down
  python3 scripts/sprite/gen_grok.py --character anni --frames 0,1,2
  python3 scripts/sprite/gen_grok.py --character anni --all
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from autofit_frame import autofit            # noqa: E402
from post_clean import key_green_aggressive  # noqa: E402
from spritecfg import get, resolve           # noqa: E402
from gen_batch import all_frames, direction_view, pixelize  # noqa: E402

# Seated poses tuck lower body behind the desk.
SEATED = {3, 4, 10, 11, 17, 18}


SEED_BY_DIR = {"down": "seed-front", "up": "seed-back", "right": "seed-side"}


def seed_path(character: str, direction: str = "down") -> Path:
    # Direction-appropriate seed keeps the view stable (front seed resists turning).
    for name in (SEED_BY_DIR.get(direction, "seed-front"), "seed-front"):
        cand = resolve(f"refs/{character}/{name}.png")
        if cand.is_file():
            return cand
    return resolve(get(f"characters.{character}.seed"))


def frame_prompt(character: str, fr: dict) -> str:
    style = get(f"characters.{character}.style")
    view = direction_view(fr["direction"])
    return "\n".join([
        f"Single full-body pixel-art game character sprite, ONE pose, {view}.",
        f"Character identity, IDENTICAL to the reference every time: {style}.",
        f"Pose / action: {fr['action']}.",
        "ONLY the character: NO desk, NO chair, NO table, NO computer, NO keyboard,",
        "NO furniture, NO props, NO floor, NO background objects of any kind.",
        "FULL BODY head-to-feet visible in this frame, IDENTICAL character scale to a",
        "standing full-body sprite (a seated pose just bends the knees, still full body).",
        "Solid pure chroma green #00ff00 background everywhere outside the character,",
        "perfectly uniform, no gradient, no shadow, no ground, no separators, no border.",
        "Whole character including ALL hair inside the frame with clear empty margin",
        "above the head and below the feet, vertically centered, about 85% of frame height,",
        "horizontally centered.",
        "Crisp pixel art, SAME palette as the reference (keep blonde hair and skin tones),",
        "1px dark outline, no anti-aliasing, no text, no watermark.",
    ])


def gen_one(character: str, fr: dict, frames_dir: Path, raw_dir: Path) -> bool:
    gidx = fr["index"]
    raw = raw_dir / f"raw-{gidx:03d}.png"
    prompt = frame_prompt(character, fr)
    cmd = [
        sys.executable, str(ROOT / "grok_imagegen.py"),
        "--input", str(seed_path(character, fr["direction"])),
        "--output", str(raw),
        "--cwd", str(resolve(".")),
        "--prompt", prompt,
        "--timeout", "360",
    ]
    print(f"[{gidx:03d}] {fr['direction']}/{fr['pose']} -> grok image_edit ...", flush=True)
    r = subprocess.run(cmd, cwd=str(resolve(".")))
    if r.returncode != 0 or not raw.is_file():
        print(f"[{gidx:03d}] FAILED (rc={r.returncode})", flush=True)
        return False

    im = key_green_aggressive(Image.open(raw).convert("RGBA"), tol=40)
    fitted = pixelize(autofit(im, "stable"), 3)
    if gidx in SEATED:
        # Nudge seated poses down so the desk hides the legs.
        nh = int(get("nativeHeight"))
        shifted = Image.new("RGBA", fitted.size, (0, 0, 0, 0))
        shifted.paste(fitted, (0, int(nh * 0.08)), fitted)
        fitted = shifted
    frames_dir.mkdir(parents=True, exist_ok=True)
    fitted.save(frames_dir / f"frame-{gidx:03d}.png")
    print(f"[{gidx:03d}] ok -> frame-{gidx:03d}.png", flush=True)
    return True


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--character", default="anni")
    p.add_argument("--row", choices=["down", "up", "right"])
    p.add_argument("--frames", help="comma list of global indices, e.g. 0,1,2")
    p.add_argument("--all", action="store_true")
    args = p.parse_args()

    frames = all_frames(args.character)
    if args.row:
        frames = [f for f in frames if f["direction"] == args.row]
    elif args.frames:
        want = {int(x) for x in args.frames.split(",")}
        frames = [f for f in frames if f["index"] in want]
    elif not args.all:
        raise SystemExit("specify --row, --frames or --all")

    bdir = resolve(f"tmp/sprites/{args.character}")
    frames_dir = bdir / "frames"
    raw_dir = bdir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    ok = 0
    for fr in frames:
        if gen_one(args.character, fr, frames_dir, raw_dir):
            ok += 1
    print(f"\ndone: {ok}/{len(frames)} frames -> {frames_dir}", flush=True)


if __name__ == "__main__":
    main()
