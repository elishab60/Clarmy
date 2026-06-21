#!/usr/bin/env python3
"""Bake the validated Clawd design into the office spritesheet (agent_claude.png).

Layout matches scene.ts createAnims: 7 columns x 3 rows (directions).
Columns: walkA, neutral, walkB, type0, type1, read0, read1.
Rows: down (front), up (back, no eyes), right (profile, eyes shifted). left = flipX at runtime.

Design source: public/office/validate-clawd.html (grille 12x8, corps #d87050, yeux #1a1a1a).
Pixels move per frame: legs alternate (walk), hands poke out (type), eyes lower + blink (read).
"""
from PIL import Image

S = 4                      # supersample: 1 grid cell -> S x S px (crisp pixel blocks)
GW, GH = 12, 8             # blob grid cells (12 wide x 8 tall)
FRAME_CELLS = 12           # SQUARE frame (12x12 cells): blob bottom-anchored with top margin
FW, FH = FRAME_CELLS * S, FRAME_CELLS * S  # 48 x 48 square
VPAD = FRAME_CELLS - GH    # 4 empty cell rows above the blob
COLS, ROWS = 7, 3
BODY = (216, 112, 80, 255)  # #d87050
EYE = (26, 26, 26, 255)     # #1a1a1a
CLEAR = (0, 0, 0, 0)
OUT = "public/office/characters/agent_claude.png"

# Body grids (no eyes). '.' transparent, 'b' body.
REST = [
    "..bbbbbbbb..",
    "..bbbbbbbb..",
    "bbbbbbbbbbbb",
    "bbbbbbbbbbbb",
    "..bbbbbbbb..",
    "..bbbbbbbb..",
    "..b.b..b.b..",
    "..b.b..b.b..",
]


def with_row(grid, idx, row):
    g = grid.copy()
    g[idx] = row
    return g


WALKA = with_row(REST, 7, "..b....b....")  # legs 2 & 7 planted
WALKB = with_row(REST, 7, "....b....b..")  # legs 4 & 9 planted
TYPEA = with_row(REST, 4, ".bbbbbbbbbb.")  # hands poke out

# Eye positions per direction. "normal" = row 1, "low" = row 2 (reading), "none" = blink/back.
EYES = {
    "down":  {"normal": [(1, 3), (1, 8)], "low": [(2, 3), (2, 8)]},
    "right": {"normal": [(1, 7), (1, 9)], "low": [(2, 7), (2, 9)]},
    "up":    {"normal": [], "low": []},
}

# Per column: (body grid, eye mode). read1 blinks (no eyes).
COLDEF = [
    (WALKA, "normal"),  # 0 walk A
    (REST,  "normal"),  # 1 neutral (idle/stand/alert/dizzy/celebrate static frame)
    (WALKB, "normal"),  # 2 walk B
    (TYPEA, "normal"),  # 3 type 0
    (REST,  "normal"),  # 4 type 1
    (REST,  "low"),     # 5 read 0 (eyes lowered)
    (REST,  "none"),    # 6 read 1 (blink)
]
ROWDEF = ["down", "up", "right"]


def cells(body, direction, eye_mode):
    """Return list of (cy, cx, color) for one frame."""
    out = []
    for cy, line in enumerate(body):
        for cx, ch in enumerate(line):
            if ch == "b":
                out.append((cy, cx, BODY))
    if eye_mode != "none":
        for (ey, ex) in EYES[direction].get(eye_mode, []):
            out.append((ey, ex, EYE))
    return out


def main():
    sheet = Image.new("RGBA", (COLS * FW, ROWS * FH), CLEAR)
    px = sheet.load()
    for r, direction in enumerate(ROWDEF):
        for c, (body, eye_mode) in enumerate(COLDEF):
            ox, oy = c * FW, r * FH
            for (cy, cx, color) in cells(body, direction, eye_mode):
                for dy in range(S):
                    for dx in range(S):
                        px[ox + cx * S + dx, oy + (cy + VPAD) * S + dy] = color
    sheet.save(OUT)
    print(f"wrote {OUT} ({sheet.width}x{sheet.height}, frame {FW}x{FH}, {COLS}x{ROWS})")


if __name__ == "__main__":
    main()
