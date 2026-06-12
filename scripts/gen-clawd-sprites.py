#!/usr/bin/env python3
"""Generate the office clawd spritesheets: public/office/characters/clawd_0..5.png.

Geometry matches the previous human sheets so the scene code is unchanged:
112x96 per sheet = 7 columns of 16x32 frames x 3 rows (down, up, right).
Columns: 0-2 walk (A, neutral, B), 3-4 typing, 5-6 reading.

The pixel design extends CLARMY's canonical 11x8 clawd (src/components/shell/
clawd.tsx): antennae with eyes, rounded body, side claws, alternating legs.
Crabs walk sideways while facing you, so the side rows reuse the front body
with a 1px directional lean and shifted eyes; the back row drops the eyes.
Six deterministic variants differ by warm body hue + a small accessory.
Original art, MIT like the repo.
"""

from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "office" / "characters"
FRAME_W, FRAME_H, COLS_PER_ROW = 16, 32, 7

# palette keys: o body, d dark (claws/outline), B eye, P paper, A accent accessory
VARIANTS = [
    {"o": "#D97757", "d": "#A85539", "acc": None},
    {"o": "#D97757", "d": "#A85539", "acc": "headphones"},
    {"o": "#C96B4B", "d": "#9C4F33", "acc": "beanie"},
    {"o": "#E08A63", "d": "#B05E3D", "acc": "sage-antenna"},
    {"o": "#CD6F52", "d": "#A05238", "acc": "visor"},
    {"o": "#D97757", "d": "#A85539", "acc": "scarf"},
]
ACCENT = {"headphones": "#2B2926", "beanie": "#EDE9E0", "sage-antenna": "#7C9A6E",
          "visor": "#2B2926", "scarf": "#7C9A6E"}
EYE = "#1F1E1C"
PAPER = "#EDE9E0"

# 16-wide grids, 11 rows tall (placed at the bottom of each 16x32 frame).
# legs variant A / neutral N / B swapped in.
BODY = [
    "...o........o...",   # antenna stems
    "...B........B...",   # eyes on stalks
    "..oooooooooooo..",
    ".dooooooooooood.",
    ".dooooooooooood.",
    "..oooooooooooo..",
    "LLLLLLLLLLLLLLLL",   # legs row 1 (placeholder)
    "llllllllllllllll",   # legs row 2 (placeholder)
]
LEGS = {
    "A": ("..o.o..o..o.o...", "..o..........o.."),
    "N": ("...o.o....o.o...", "................"),
    "B": ("...o.o..o.o.o...", "....o........o.."),
}
# typing: claws raised beside the head, two alternating heights
CLAWS_UP_1 = "dd............dd"
CLAWS_UP_2 = ".dd..........dd."


def grid_for(pose: str, frame: int) -> list[str]:
    rows = list(BODY)
    if pose == "walk":
        a, b = LEGS[["A", "N", "B"][frame]]
        rows[6], rows[7] = a, b
    else:
        a, b = LEGS["N"]
        rows[6], rows[7] = a, b
    if pose == "type":
        # claws raised above the body line, alternating
        rows.insert(2, CLAWS_UP_1 if frame == 0 else CLAWS_UP_2)
        rows.pop()  # keep 8 visual rows + claw row fits in frame anyway
    if pose == "read":
        # a small paper held in front of the body (lower center)
        paper = list(rows[5])
        for x in range(6, 10):
            paper[x] = "P"
        rows[5] = "".join(paper)
        if frame == 1:  # second frame: eyes glance down
            rows[1] = rows[1].replace("B", "b")
    return rows


def draw(im: Image.Image, ox: int, oy: int, rows: list[str], colors: dict[str, str],
         direction: str, accessory: str | None) -> None:
    px = im.load()
    height = len(rows)
    top = oy + FRAME_H - 2 - height  # 2px ground margin
    lean = {"right": 1, "left": -1}.get(direction, 0)

    def put(x: int, y: int, hexcolor: str) -> None:
        if 0 <= x - ox < FRAME_W and 0 <= y - oy < FRAME_H:
            h = hexcolor.lstrip("#")
            px[x, y] = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)

    for ry, row in enumerate(rows):
        y = top + ry
        row_lean = lean if ry < 4 else 0  # lean the head rows toward travel
        for rx, ch in enumerate(row):
            if ch in (".", " "):
                continue
            x = ox + rx + row_lean
            if ch == "o":
                put(x, y, colors["o"])
            elif ch == "d":
                put(x, y, colors["d"])
            elif ch == "B":
                if direction == "up":
                    put(x, y, colors["o"])  # back view: no eyes
                else:
                    put(x + lean, y, EYE)
            elif ch == "b":  # glancing eye (reading frame 2)
                put(x + lean, y + 1, EYE) if direction != "up" else put(x, y, colors["o"])
            elif ch == "P":
                put(x, y, PAPER)
            elif ch == "L" or ch == "l":
                continue

    if accessory and direction != "up":
        acc = ACCENT[accessory]
        body_top = top + 2
        if accessory == "headphones":
            for rx in (2, 13):
                put(ox + rx, body_top + 1, acc)
                put(ox + rx, body_top + 2, acc)
            for rx in range(3, 13):
                put(ox + rx, body_top - 1, acc)
        elif accessory == "beanie":
            for rx in range(3, 13):
                put(ox + rx, body_top - 1, acc)
                put(ox + rx, body_top, acc)
        elif accessory == "sage-antenna":
            put(ox + 3 + lean, top, acc)
            put(ox + 12 + lean, top, acc)
        elif accessory == "visor":
            for rx in range(4, 12):
                put(ox + rx + lean, top + 1, acc)
        elif accessory == "scarf":
            for rx in range(4, 12):
                put(ox + rx, body_top + 4, acc)


def build_sheet(variant: dict[str, str | None]) -> Image.Image:
    im = Image.new("RGBA", (FRAME_W * COLS_PER_ROW, FRAME_H * 3), (0, 0, 0, 0))
    colors = {"o": variant["o"], "d": variant["d"]}
    poses = [("walk", 0), ("walk", 1), ("walk", 2), ("type", 0), ("type", 1), ("read", 0), ("read", 1)]
    for dir_idx, direction in enumerate(["down", "up", "right"]):
        for col, (pose, frame) in enumerate(poses):
            rows = grid_for(pose, frame)
            draw(im, col * FRAME_W, dir_idx * FRAME_H, rows, colors, direction, variant["acc"])
    return im


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for i, v in enumerate(VARIANTS):
        build_sheet(v).save(OUT / f"clawd_{i}.png")
    print(f"wrote {len(VARIANTS)} clawd sheets -> {OUT}")
