#!/usr/bin/env python3
"""
Per-frame generation + assemble for Anni sprites (fixed 128x256 per image, assemble at end).

Workflow (as per user request for scale control):
1. Generate each of the 21 frames *one by one* (using image_edit on the prepared per-frame canvas + the prompt file + the 3 refs).
   Each generated image should be forced to exactly 128x256 in prompt.
2. Put the 21 generated files in a dir (e.g. tmp/sprites/anni/generated-frames/), named frame-000.jpg ... frame-020.jpg (or .png).
3. Run this script: python scripts/sprite/assemble_per_frame.py --gen-dir tmp/sprites/anni/generated-frames --out previews/my-new-sheet.png
4. The script will:
   - For each: resize to exactly 128x256 (LANCZOS to preserve), key green (aggressive), find content, center with special y for seated (to fix scale for "sur le bureau" desk).
   - Save clean frames.
   - Assemble the 7x3 sheet.
   - Then you can run the standard quantize + strip2 + post_clean.py on the sheet.

This avoids the model struggling with multi-slot layout (which caused scale drift, cuts, overlaps, green at limits).

The per-frame canvases and prompts are pre-prepared in tmp/sprites/anni/per-frame/ (from the run).

See the skill for the full prompt template per pose.
"""
import argparse
from PIL import Image
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent))
from spritecfg import get
from post_clean import key_green_aggressive  # reuse the key logic

nw, nh = int(get("nativeWidth")), int(get("nativeHeight"))

# Seated indices (for special y offset for desk context)
SEATED = {3,4,10,11,17,18}

def process_generated(gen_path, out_frame_path, is_seated=False):
    im = Image.open(gen_path).convert("RGBA")
    # force fixed dimensions
    if im.size != (nw, nh):
        im = im.resize((nw, nh), Image.LANCZOS)
    # key
    im = key_green_aggressive(im, tol=40)
    # find content
    bbox = im.getbbox()
    if not bbox:
        Image.new("RGBA", (nw, nh), (0,0,0,0)).save(out_frame_path)
        return
    content = im.crop(bbox)
    cw, ch = content.size
    # scale to fit with ratio (enforce the ~88% )
    ratio = 0.88
    scale = min(nw / cw, nh / ch) * ratio
    tw, th = max(1, int(cw * scale)), max(1, int(ch * scale))
    content = content.resize((tw, th), Image.LANCZOS)
    # center
    new = Image.new("RGBA", (nw, nh), (0,0,0,0))
    pos_x = (nw - tw) // 2
    if is_seated:
        # tuck the lower body for desk (adjust this offset by looking at bureau composite)
        pos_y = nh - th + 20  # positive to move up (tuck), tune as needed (try 10-40)
    else:
        pos_y = nh - th
    new.paste(content, (pos_x, pos_y), content)
    new.save(out_frame_path)

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--gen-dir", required=True, help="dir with the 21 generated images named frame-000.jpg ... frame-020.jpg")
    p.add_argument("--out", required=True, help="output sheet png")
    args = p.parse_args()

    gen_dir = Path(args.gen_dir)
    frames_dir = gen_dir.parent / "processed-frames"
    frames_dir.mkdir(exist_ok=True)

    for idx in range(21):
        gen = gen_dir / f"frame-{idx:03d}.jpg"
        if not gen.exists():
            gen = gen_dir / f"frame-{idx:03d}.png"
        if not gen.exists():
            print(f"warning: missing {idx}")
            continue
        is_seated = idx in SEATED
        outf = frames_dir / f"frame-{idx:03d}.png"
        process_generated(gen, outf, is_seated)
        print(f"processed {idx}")

    # assemble
    from PIL import Image as PILImage
    sheet = PILImage.new("RGBA", (7 * nw, 3 * nh), (0,0,0,0))
    for idx in range(21):
        r = idx // 7
        c = idx % 7
        f = frames_dir / f"frame-{idx:03d}.png"
        if f.exists():
            cell = PILImage.open(f)
            sheet.paste(cell, (c * nw, r * nh), cell)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.out)
    print(f"assembled {args.out}")

    print("Now run on the out sheet:")
    print("  python scripts/sprite/quantize_palette.py --character anni --in OUT --out OUT")
    print("  python scripts/sprite/strip_chroma.py --in OUT --out OUT --pass 2")
    print("  python scripts/sprite/post_clean.py --in OUT --out FINAL --aggressive")
    print("  python scripts/sprite/audit_sprite.py --frames-dir ... (the processed-frames)")

if __name__ == "__main__":
    main()
