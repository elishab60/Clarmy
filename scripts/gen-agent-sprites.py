#!/usr/bin/env python3
"""Generate provider-themed office characters: public/office/characters/agent_*.png.

Each sheet is 112x96 (7x16 by 3x32): down / up / right rows, columns walk A-N-B,
type x2, read x2 — same contract as the legacy clawd sheets so scene.ts stays
compatible. Original pixel art personas, MIT like the repo.

Personas (French brief):
  Grok   — Anni (Desktop/anni/) : waifu gothique busty, corset or, jupe volants HD 32×64
  Claude — nerd classe, lunettes, cravate orange serrée
  Gemini — chevalier poète, heaume, cape bleue, joyau doré, épée
  Codex  — spectateur défait, hoodie vert Copilot, cernes, posture affaissée
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "office" / "characters"
FRAME_W, FRAME_H, COLS_PER_ROW = 16, 32, 7

LEGS = {
    "A": ("....dL....dL...", ".....l.......l.."),
    "N": ("....dLdL..dLdL..", "................"),
    "B": ("....dL..dLdLdL..", "......l.......l."),
}
LEGS_HD = {
    "A": ("...ddLL................LLdd...", "....ll..................ll...."),
    "N": ("...ddLdL..............dLdL....", ".............................."),
    "B": ("...ddL..dLdL..........dLdL....", ".....ll..................ll...."),
}

TYPING_ARMS = ("dd............dd", ".dd..........dd.")
READ_ARMS = ("..d...........d..", ".d...........d..")
TYPING_ARMS_HD = ("dddd........................dddd", ".dddd......................dddd.")
READ_ARMS_HD = ("..dd........................dd..", ".dd..........................dd.")


def blank(n: int = 20) -> list[str]:
    return ["................"] * n


def overlay(base: list[str], patch: list[str], oy: int) -> list[str]:
    out = list(base)
    for i, row in enumerate(patch):
        y = oy + i
        if y >= len(out):
            out.extend(["................"] * (y - len(out) + 1))
        merged = list(out[y])
        for x, ch in enumerate(row):
            if ch not in (".", " "):
                merged[x] = ch
        out[y] = "".join(merged)
    return out


def pose_rows(character: dict, pose: str, frame: int, direction: str) -> list[str]:
    hd = character.get("width", FRAME_W) > FRAME_W
    legs = LEGS_HD if hd else LEGS
    if direction == "right" and character.get("side"):
        rows = list(character["side"])
    elif direction == "up" and character.get("back"):
        rows = list(character["back"])
    else:
        rows = list(character["base"])

    if pose == "walk":
        a, b = legs[["A", "N", "B"][frame]]
        rows = overlay(rows, [a, b], len(rows) - 2)
    else:
        a, b = legs["N"]
        rows = overlay(rows, [a, b], len(rows) - 2)

    if pose == "type":
        arm = (TYPING_ARMS_HD if hd else TYPING_ARMS)[frame]
        rows = overlay(rows, [arm], 3 if hd else 2)
        if character.get("type_extra"):
            rows = overlay(rows, character["type_extra"][frame], 2 if hd else 1)

    if pose == "read":
        arm = (READ_ARMS_HD if hd else READ_ARMS)[frame]
        rows = overlay(rows, [arm], 3 if hd else 2)
        if character.get("read_extra"):
            rows = overlay(rows, character["read_extra"][frame], 4)
        else:
            paper_row = list(rows[min(8, len(rows) - 1)])
            for x in range(6, 10):
                if x < len(paper_row):
                    paper_row[x] = "P"
            rows[min(8, len(rows) - 1)] = "".join(paper_row)
        if frame == 1 and direction == "down":
            for i in range(len(rows)):
                row = list(rows[i])
                for x, ch in enumerate(row):
                    if ch == "B":
                        row[x] = "."
                rows[i] = "".join(row)
            glance_y = min(4, len(rows) - 1)
            glance = list(rows[glance_y])
            for x in range(6, 10):
                if glance[x] == ".":
                    glance[x] = "B"
            rows[glance_y] = "".join(glance)

    if direction == "up" and not character.get("back"):
        for i in range(len(rows)):
            row = list(rows[i])
            for x, ch in enumerate(row):
                if ch in ("E", "B", "G", "N", "K", "V", "M", "U", "J", "X", "S"):
                    row[x] = "H" if ch in ("E", "B", "G", "K", "V", "M", "U", "J", "X", "S") else "T"
            rows[i] = "".join(row)

    return rows[: character.get("max_rows", 20)]


def draw(
    im: Image.Image, ox: int, oy: int, rows: list[str], colors: dict[str, str],
    frame_h: int = FRAME_H, frame_w: int = FRAME_W,
) -> None:
    px = im.load()
    height = len(rows)
    top = oy + frame_h - 2 - height

    def put(x: int, y: int, hexcolor: str) -> None:
        if 0 <= x - ox < frame_w and 0 <= y - oy < frame_h:
            h = hexcolor.lstrip("#")
            px[x, y] = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)

    for ry, row in enumerate(rows):
        y = top + ry
        for rx, ch in enumerate(row):
            if ch in (".", " "):
                continue
            col = colors.get(ch)
            if col:
                put(ox + rx, y, col)


# ── Grok: Anni — waifu gothique, couettes blondes, corset or, jupe volants, filet ─
# HD 32×64 (2×) — refs Desktop/anni/ref{1,2,3}.png

GROK = {
    "name": "grok",
    "width": 32,
    "frame_h": 64,
    "max_rows": 30,
    "colors": {
        "H": "#E8C848", "h": "#FFF0A0", "E": "#F8FCFF", "B": "#3A88E8",
        "S": "#F8D0C0", "F": "#E8B0A0", "T": "#141018", "t": "#1A1018",
        "L": "#2A2838", "R": "#3A3048", "K": "#9B7CFF", "J": "#C84868",
        "n": "#4A4068", "b": "#141018", "W": "#C9A84C", "G": "#A07830",
        "C": "#EDE9E0", "P": "#EDE9E0", "d": "#0A0810", "l": "#0A0810",
    },
    "base": [
        "..ttHH....................HHtt..",
        "..ttHHHHHHHHHHHHHHHHHHHHHHHHtt..",
        "....hhhhhhhhhhhhhhhhhhhhhhhh....",
        "...hhhhEEEEEEEEEEEEEEEEEEhhhh...",
        "..hhhEEBBBBBBBBBBBBBBBBEEhhh....",
        "..hhhEEBBBBBBBBBBBBBBBBEEhhh....",
        "...hhHSFFFFFFFFFFFFFFShhh.......",
        "...hhHKKKTTTTTTTTTTKKKhh........",
        "..ddhhHTTTGGGGWWGGGTTThhdd......",
        "...hhHTTTTTTTTTTTTTTTThhhh......",
        "...hhHTTTTTTTTTTTTTTTThhhh......",
        "...hhHTLLLLLLLLLLLLLLTThh.......",
        "...hhHTLJJJJJJJJJJJJLTThh.......",
        "...hhHTLJJJJJJJJJJJJLTThh.......",
        "..ddhhHTTTTTTTTTTTTTTThhdd......",
        "...hhHTnn...........nnTThh......",
        "...hhHTnn...........nnTThh......",
        "...hhHTLb...........bLTThh......",
        "...ddLL................LLdd.....",
        "....ll..................ll......",
    ],
    "side": [
        ".........tt.....................",
        ".......ttHHHHHHHHHHHHHHtt.......",
        "......hhhhhhhhhhhhhhhhhh........",
        ".....hhhEEEEEEEEEEEEhh..........",
        ".....hhEEBBBBBBBBBBEhh..........",
        ".....hhEEBBBBBBBBBBEhh..........",
        "......hHSFFFFFFFFFShh...........",
        "......hHKKKTTTTTTKKKh...........",
        ".....ddhHTTTGGWGGTTThdd.........",
        "......hHTTTTTTTTTTTThh..........",
        "......hHTTTTTTTTTTTThh..........",
        "......hHTLLLLLLLLLLTThh.........",
        "......hHTLJJJJJJJJLTThh.........",
        "......hHTLJJJJJJJJLTThh.........",
        ".....ddhHTTTTTTTTTTThdd.........",
        "......hHTnn........nnThh........",
        "......hHTnn........nnThh........",
        "......hHTLb........bLTThh.......",
        "......ddLL..........LLdd........",
        ".......ll............ll.........",
    ],
    "back": [
        "........tt.............tt.......",
        "......ttHHHHHHHHHHHHHHHHHHtt....",
        "....hhhhhhhhhhhhhhhhhhhhhhhh....",
        "...hhhhhhhhhhhhhhhhhhhhhhhhhh...",
        "...hhhhhhhhhhhhhhhhhhhhhhhhhh...",
        "...hhhhhhhhhhhhhhhhhhhhhhhhhh...",
        "...hhhhhhhhhhhhhhhhhhhhhhhhhh...",
        "..ddhhHTTTTTTTTTTTTTTThhdd......",
        "...hhHTTTTTTTTTTTTTTTThhhh......",
        "...hhHTTTTTTTTTTTTTTTThhhh......",
        "...hhHTLLLLLLLLLLLLLLTThhh......",
        "...hhHTLJJJJJJJJJJJJLTThhh......",
        "...hhHTLJJJJJJJJJJJJLTThhh......",
        "..ddhhHTTTTTTTTTTTTTTThhdd......",
        "...hhHTnn...........nnTThh......",
        "...hhHTLb...........bLTThh......",
        "...ddLL................LLdd.....",
        "....ll..................ll......",
    ],
    "type_extra": [
        ["................................", "................................"],
        ["................................", "................................"],
    ],
}

# ── Claude: nerd classe — lunettes, cravate orange, chemise crème ────────────

CLAUDE = {
    "name": "claude",
    "colors": {
        "S": "#E8C8A8", "H": "#3D2E22", "E": "#F8F4EC", "B": "#1F1E1C",
        "F": "#D4B090", "T": "#EDE9E0", "N": "#D97757", "n": "#B85A3A",
        "G": "#2B2926", "g": "#8A857C", "L": "#2B2926", "l": "#1F1E1C",
        "P": "#4796E3", "d": "#1F1E1C", "M": "#8A7060",
    },
    "base": [
        "................",
        "..HHHHHHHHHHHH..",
        "..HHEEEEEEHHHH..",
        "..HHBHGGBBHHHH..",
        "..HHFFFFFFHHHH..",
        ".dHHTTTTTTTTHHd.",
        "..HTTTNNNNTTT...",
        "..HTTTTTTTTTT...",
        "..HHPPPPPPHHH...",
        "..HHTTTTTTTHH...",
        "..HHTTTTTTTHH...",
        "..dd........dd..",
        "....dL....dL....",
        ".....l.......l..",
    ],
    "side": [
        "................",
        ".....HHHHHHH....",
        ".....HHEEEEH....",
        ".....HHBGGBH....",
        ".....HHFFFHH....",
        ".....dHTTTTHd...",
        "......HTNNTH....",
        "......HTTTTH....",
        "......HPPPHH....",
        "......HTTTTH....",
        "......dd..dd....",
        ".......dL.dL....",
        "........l..l....",
    ],
    "back": [
        "................",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
        ".dHHTTTTTTTTHHd.",
        "..HTTTTTTTTTT...",
        "..HTTTTTTTTTT...",
        "..HHTTTTTTTHH...",
        "..HHTTTTTTTHH...",
        "....dL....dL....",
        ".....l.......l..",
    ],
}

# ── Gemini: chevalier poète — heaume, cape, armure, joyau, épée ────────────

GEMINI = {
    "name": "gemini",
    "colors": {
        "S": "#E8C0A0", "H": "#6A5030", "E": "#F0E8D8", "B": "#2A2018",
        "F": "#C8A080", "A": "#7A8AAA", "a": "#5A6A88", "C": "#4796E3",
        "c": "#2A6090", "V": "#9AA8C0", "v": "#6A7898", "L": "#4A5060",
        "l": "#2A3040", "P": "#F5E6C8", "d": "#2A3040", "W": "#C9A84C",
        "w": "#A07830", "J": "#E8C040", "M": "#6A5040", "z": "#D8C8A8",
    },
    "base": [
        "..CCCCCCCCCCCC..",
        "..VVVVVVVVVVVV..",
        "..VVEEEEEEEVVV..",
        "..VVBVJJMVBVVV..",
        "..VVFFFFFFVVVV..",
        ".dVVAAAAAAAVVd..",
        "..VAAAWWAAAVVV..",
        "..VAAAAAAAAAVV..",
        "..CCAAAAAAACCC..",
        "..CCAAAAAAACCC..",
        "..ddz.....dd....",
        "....dL....dL....",
        ".....l.......l..",
    ],
    "side": [
        ".....CCCCCC.....",
        ".....VVVVVV.....",
        ".....VVEEEV.....",
        ".....VVBVVB.....",
        ".....VVFFVV.....",
        ".....dAAAVd.....",
        "......AAWAV.......",
        "......AAAAV.....",
        "......CCACV.....",
        "......ddzdd.....",
        ".......dLdL.....",
        "........l.l.....",
    ],
    "back": [
        "..CCCCCCCCCCCC..",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
        ".dAAAAAAAAAAAd..",
        "..AAAAAAAAAAAA..",
        "..AAAAAAAAAAAA..",
        "..CCAAAAAAACCC..",
        "..CCAAAAAAACCC..",
        "....dL....dL....",
        ".....l.......l..",
    ],
    "read_extra": [
        ["......P..........", "......P.........."],
        ["......P..........", ".......P........."],
    ],
}

# ── Codex/Copilot: spectateur défait — hoodie vert, cernes, posture basse ──

CODEX = {
    "name": "codex",
    "colors": {
        "S": "#E0B898", "H": "#5A4030", "E": "#F5F0E8", "B": "#2B2926",
        "F": "#C89878", "Y": "#10A37F", "y": "#0A8060", "G": "#EDE9E0",
        "U": "#8A7068", "L": "#3A4A58", "l": "#2A3848", "P": "#4796E3",
        "d": "#2B2926", "M": "#7A6050", "Q": "#2B2926",
    },
    "base": [
        "................",
        "..HHHHHHHHHHHH..",
        "..HHEEEEEEHHHH..",
        "..HHBUHHUBHHHH..",
        "..HHFFFFFFHHHH..",
        ".dHHYYYYYYYHHd..",
        "..HYYYYYYYYYY...",
        "..HYYGGGGGYY....",
        "..HHYYYYYYHHH...",
        "..HHYYYYYYHHH...",
        "..ddQ.....dd....",
        "....dL....dL....",
        ".....l.......l..",
    ],
    "side": [
        "................",
        ".....HHHHHHH....",
        ".....HHEEEEH....",
        ".....HHBUUBH....",
        ".....HHFFFHH....",
        ".....dYYYYYd....",
        "......YYYYY.....",
        "......YGGYY.....",
        "......YYYYH.....",
        "......ddQdd.....",
        ".......dL.dL....",
        "........l..l....",
    ],
    "back": [
        "................",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
        ".dHHYYYYYYYHHd..",
        "..HYYYYYYYYYY...",
        "..HYYYYYYYYYY...",
        "..HHYYYYYYHHH...",
        "..HHYYYYYYHHH...",
        "....dL....dL....",
        ".....l.......l..",
    ],
    "read_extra": [
        ["......P..........", "......P.........."],
        ["......P..........", ".......P........."],
    ],
    "type_extra": [
        ["................", "................"],
        ["................", "................"],
    ],
}

AGENTS = [GROK, CLAUDE, GEMINI, CODEX]


def build_sheet(agent: dict) -> Image.Image:
    fw = agent.get("width", FRAME_W)
    fh = agent.get("frame_h", FRAME_H)
    im = Image.new("RGBA", (fw * COLS_PER_ROW, fh * 3), (0, 0, 0, 0))
    poses = [("walk", 0), ("walk", 1), ("walk", 2), ("type", 0), ("type", 1), ("read", 0), ("read", 1)]
    for dir_idx, direction in enumerate(["down", "up", "right"]):
        for col, (pose, frame) in enumerate(poses):
            rows = pose_rows(agent, pose, frame, direction)
            draw(im, col * fw, dir_idx * fh, rows, agent["colors"], fh, fw)
    return im


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for agent in AGENTS:
        path = OUT / f"agent_{agent['name']}.png"
        build_sheet(agent).save(path)
        print(f"wrote {path.name}")