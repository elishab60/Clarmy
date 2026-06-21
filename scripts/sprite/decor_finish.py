#!/usr/bin/env python3
"""Upgrade office decor frames to HD via Grok image_edit, then patch the atlas.

Per frame: use the current atlas frame as the proportion/style anchor (image_edit
keeps shape+palette), green-key the result, LANCZOS-downsample to ~2x the on-grid
DECOR_W (crisp at the tiny in-game size, no nearest mush), save to
public/office/decor-hd/<NAME>.png and patch it into the atlas.

Usage: python3 scripts/sprite/decor_finish.py NAME1,NAME2,...
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "sprite"))
from reprocess import strip_green, fill_holes  # noqa: E402
from atlas_patch import patch as atlas_patch    # noqa: E402

# On-grid width per frame (mirrors scene.ts DECOR_W). Stored at 2x for crisp display.
DECOR_W = {
    "DESK_FRONT": 48, "DESK_SIDE": 16, "DESK_SINGLE": 16,
    "PC_FRONT_OFF": 16, "PC_FRONT_ON_1": 16, "PC_FRONT_ON_2": 16, "PC_FRONT_ON_3": 16,
    "WOODEN_CHAIR_FRONT": 16, "CUSHIONED_CHAIR_FRONT": 16, "CUSHIONED_CHAIR_BACK": 16,
    "CUSHIONED_BENCH": 16, "SOFA_FRONT": 32, "BOOKSHELF": 32, "DOUBLE_BOOKSHELF": 32,
    "COFFEE_TABLE": 32, "SMALL_TABLE": 32, "PLANT": 16, "LARGE_PLANT": 32, "CACTUS": 16,
    "WHITEBOARD": 32, "CLOCK": 16, "BIN": 16, "COFFEE": 16,
    "GOTHIC_ALTAR": 16, "SKULL_CANDLE": 16, "BOOKSHELF_FANCY": 16, "LIBRARY_LAMP": 16,
    "KNIGHT_BANNER": 16, "ARMOR_STAND": 16, "TV_SCREEN": 16, "POPCORN": 16, "SPECTATOR_CHAIR": 16,
}

LABEL = {
    "DESK_FRONT": "wide office desk seen from the front",
    "DESK_SIDE": "office desk seen from the side",
    "DESK_SINGLE": "single small office desk, front view",
    "PC_FRONT_OFF": "desktop computer monitor (dark screen, off) on a small stand, front view",
    "PC_FRONT_ON_1": "desktop computer monitor with a softly glowing screen, front view",
    "PC_FRONT_ON_2": "desktop computer monitor with a glowing screen, front view",
    "PC_FRONT_ON_3": "desktop computer monitor with a bright glowing screen, front view",
    "WOODEN_CHAIR_FRONT": "simple wooden chair, front view",
    "CUSHIONED_CHAIR_FRONT": "cushioned office chair, front view",
    "CUSHIONED_CHAIR_BACK": "cushioned office chair seen from behind",
    "CUSHIONED_BENCH": "long cushioned bench",
    "SOFA_FRONT": "cozy two-seat sofa, front view",
    "BOOKSHELF": "wooden bookshelf filled with colorful books",
    "DOUBLE_BOOKSHELF": "tall wooden double bookshelf full of books",
    "COFFEE_TABLE": "small low coffee table",
    "SMALL_TABLE": "small round side table",
    "PLANT": "potted leafy plant",
    "LARGE_PLANT": "large potted plant",
    "CACTUS": "potted cactus",
    "WHITEBOARD": "office whiteboard on a stand",
    "CLOCK": "round wall clock",
    "BIN": "small office trash bin",
    "COFFEE": "coffee mug",
    "GOTHIC_ALTAR": "a small dark gothic stone altar topped with purple candles, eerie, dark stone and purple palette",
    "SKULL_CANDLE": "a lit candle melting on top of a small pale skull, gothic, dark with an eerie purple glow",
    "BOOKSHELF_FANCY": "an ornate carved dark-wood bookshelf filled with books",
    "LIBRARY_LAMP": "a vintage brass library desk lamp with a green glass shade and warm glow",
    "KNIGHT_BANNER": "a medieval heraldic banner hanging from a pole with a shield crest, blue and silver palette",
    "ARMOR_STAND": "a polished medieval suit of plate armor on a stand, steel and silver palette",
    "TV_SCREEN": "a modern flat-screen TV on a stand with a softly glowing blue screen and dark frame",
    "POPCORN": "a red and white striped bucket full of popcorn",
    "SPECTATOR_CHAIR": "a simple folding spectator chair, teal and green palette",
}

DECOR_HD = ROOT / "public/office/decor-hd"
TMP = ROOT / "tmp/decor"


def ref_for(name: str) -> Path:
    """Current atlas frame as the anchor; extract it if not already on disk."""
    p = TMP / f"old-{name}.png"
    if p.is_file():
        return p
    atlas = Image.open(ROOT / "public/office/atlas.png").convert("RGBA")
    frames = json.loads((ROOT / "public/office/atlas.json").read_text())["frames"]
    f = frames[name]["frame"]
    TMP.mkdir(parents=True, exist_ok=True)
    crop = atlas.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
    crop.save(p)
    return p


def prompt_for(name: str) -> str:
    # This Grok build's image tool is description-only (no reference_image_paths),
    # so the office style must live in the prompt.
    return (
        f"{LABEL.get(name, 'an office object')}, high-quality detailed pixel-art game "
        "asset for a cozy pixel-art office. Flat front-on 2D game view, NOT 3D, NOT "
        "photorealistic, NOT isometric. Cohesive limited palette that fits the description, "
        "clean 1px dark outline, soft shading. Solid pure chroma green "
        "#00ff00 background everywhere outside the object, uniform, no floor, no shadow, "
        "no character, no text, no watermark. The object is centered and fills most of the frame."
    )


def finish(name: str) -> bool:
    raw = TMP / f"new-{name}-raw.png"
    cmd = [
        sys.executable, str(ROOT / "scripts/sprite/grok_imagegen.py"),
        "--output", str(raw), "--cwd", str(ROOT),
        "--prompt", prompt_for(name), "--timeout", "360",
    ]
    print(f"[{name}] grok image_gen ...", flush=True)
    if subprocess.run(cmd, cwd=str(ROOT)).returncode != 0 or not raw.is_file():
        print(f"[{name}] FAILED", flush=True)
        return False

    im = fill_holes(strip_green(Image.open(raw)))
    box = im.getbbox()
    if not box:
        print(f"[{name}] empty after key", flush=True)
        return False
    crop = im.crop(box)
    w = DECOR_W.get(name, 16) * 2  # store at 2x on-grid width for crisp downscale
    h = max(1, round(w * crop.height / crop.width))
    out = crop.resize((w, h), Image.LANCZOS)
    DECOR_HD.mkdir(parents=True, exist_ok=True)
    dst = DECOR_HD / f"{name}.png"
    out.save(dst)
    atlas_patch(name, dst)
    return True


def main() -> None:
    names = [n for n in sys.argv[1].split(",") if n]
    ok = 0
    for n in names:
        if finish(n):
            ok += 1
    print(f"\ndecor done: {ok}/{len(names)}", flush=True)


if __name__ == "__main__":
    main()
