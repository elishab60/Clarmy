#!/usr/bin/env python3
"""Build agent_grok.png from Anni refs at native resolution (no sheet downscale)."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPRITE_CFG = ROOT / "scripts" / "sprite" / "config" / "sprite.json"
REFS = ROOT / "refs" / "anni"
OUT = ROOT / "public" / "office" / "characters" / "agent_grok.png"
PREVIEW = REFS / "preview"
COLS = 7


def load_cfg() -> dict:
    return json.loads(SPRITE_CFG.read_text())


_spec = importlib.util.spec_from_file_location(
    "gen_agent_sprites",
    Path(__file__).resolve().parent / "gen-agent-sprites.py",
)
_mod = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_mod)

GROK = _mod.GROK
build_sheet = _mod.build_sheet


def trim_alpha(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    box = im.getbbox()
    return im.crop(box) if box else im


def ref_to_frame(im: Image.Image, fw: int, fh: int) -> Image.Image:
    im = trim_alpha(im)
    lw, lh = im.size
    ratio = float(load_cfg().get("targetRatio", 0.88))
    scale = min(fw / lw, fh / lh) * ratio
    nw, nh = max(1, int(lw * scale)), max(1, int(lh * scale))
    scaled = im.resize((nw, nh), Image.LANCZOS)
    out = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    out.paste(scaled, ((fw - nw) // 2, fh - nh), scaled)
    return out


def upscale_proc(sheet: Image.Image, scale: int) -> Image.Image:
    return sheet.resize((sheet.width * scale, sheet.height * scale), Image.NEAREST)


def paste_strip(dst: Image.Image, src: Image.Image, y0: int, y1: int) -> None:
    y0, y1 = max(0, y0), min(dst.height, y1)
    if y1 <= y0:
        return
    strip = src.crop((0, y0, src.width, y1))
    dst.paste(strip, (0, y0), strip)


def main() -> None:
    cfg = load_cfg()
    char = cfg["characters"]["anni"]
    fw, fh = int(cfg["nativeWidth"]), int(cfg["nativeHeight"])
    proc_scale = fw // 32

    ref_front = ROOT / char.get("seed", "refs/anni/ref-chibi.png")
    ref_side = REFS / "ref2.png"
    if not ref_front.exists():
        raise SystemExit(f"missing ref: {ref_front}")

    PREVIEW.mkdir(parents=True, exist_ok=True)
    body_down = ref_to_frame(Image.open(ref_front), fw, fh)
    body_side = ref_to_frame(Image.open(ref_side), fw, fh) if ref_side.exists() else body_down
    body_down.save(PREVIEW / "anni-body-down.png")
    body_side.save(PREVIEW / "anni-body-side.png")

    proc = upscale_proc(build_sheet(GROK), proc_scale)
    sheet = Image.new("RGBA", (fw * COLS, fh * 3), (0, 0, 0, 0))
    poses = [("walk", 0), ("walk", 1), ("walk", 2), ("type", 0), ("type", 1), ("read", 0), ("read", 1)]
    leg_y = int(fh * 0.72)
    arm_y0, arm_y1 = int(fh * 0.18), int(fh * 0.42)

    for col, (pose, _) in enumerate(poses):
        px = col * fw
        proc_down = proc.crop((px, 0, px + fw, fh))
        frame = body_down.copy()
        if pose == "walk":
            paste_strip(frame, proc_down, leg_y, fh)
        elif pose in ("type", "read"):
            paste_strip(frame, proc_down, arm_y0, arm_y1)
        sheet.paste(frame, (px, 0), frame)

    for col in range(COLS):
        px = col * fw
        sheet.paste(proc.crop((px, fh, px + fw, fh * 2)), (px, fh))

    for col, (pose, _) in enumerate(poses):
        px = col * fw
        if pose == "walk":
            frame = body_side.copy()
            paste_strip(frame, proc.crop((px, fh * 2, px + fw, fh * 3)), leg_y, fh)
            sheet.paste(frame, (px, fh * 2), frame)
        else:
            sheet.paste(proc.crop((px, fh * 2, px + fw, fh * 3)), (px, fh * 2))

    sheet.save(OUT)
    sheet.save(PREVIEW / "anni-sheet-final.png")
    print(f"wrote {OUT} ({sheet.width}×{sheet.height}, native {fw}×{fh})")


if __name__ == "__main__":
    main()