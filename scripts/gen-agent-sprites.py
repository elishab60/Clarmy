#!/usr/bin/env python3
"""Generate provider-themed office characters: public/office/characters/agent_*.png.

Each sheet is 112x96 (7x16 by 3x32): down / up / right rows, columns walk A-N-B,
type x2, read x2 — same contract as the legacy clawd sheets so scene.ts stays
compatible. Original pixel art personas, MIT like the repo.
"""

from __future__ import annotations

from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "office" / "characters"
FRAME_W, FRAME_H, COLS_PER_ROW = 16, 32, 7

# Token legend (per row, 16 chars wide):
# . empty  S skin  H hair  E eye white  B eye pupil  F face shadow
# T shirt/suit  A armor  C cape  L leg  l shoe  P paper  d dark outline
# G glasses  N tie  K choker  V visor  R robe  W wing/cape trim
# X cigarette  Y hoodie  O orb  U under-eye  M mouth  J jewel

LEGS = {
    "A": ("..L..L....L..L..", "..l..........l.."),
    "N": ("...L.L....L.L...", "................"),
    "B": ("....L.L..L.L.L..", ".....l........l."),
}

TYPING_ARMS = ("dd............dd", ".dd..........dd.")
READ_ARMS = ("..d...........d..", ".d...........d..")


def blank() -> list[str]:
    return ["................"] * 10


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
    rows = list(character["base"])
    if pose == "walk":
        a, b = LEGS[["A", "N", "B"][frame]]
        rows = overlay(rows, [a, b], len(rows) - 2)
    else:
        a, b = LEGS["N"]
        rows = overlay(rows, [a, b], len(rows) - 2)

    if pose == "type":
        arm = TYPING_ARMS[frame]
        rows = overlay(rows, [arm], 2)
        if character.get("type_extra"):
            rows = overlay(rows, character["type_extra"][frame], 1)

    if pose == "read":
        arm = READ_ARMS[frame]
        rows = overlay(rows, [arm], 2)
        paper_row = list(rows[6])
        for x in range(6, 10):
            paper_row[x] = "P"
        rows[6] = "".join(paper_row)
        if frame == 1 and direction != "up":
            eye = list(rows[2])
            for x, ch in enumerate(eye):
                if ch == "B":
                    eye[x] = "."
            rows[2] = "".join(eye)
            glance = list(rows[3])
            for x in range(6, 10):
                if glance[x] == ".":
                    glance[x] = "B"
            rows[3] = "".join(glance)

    if direction == "up":
        for i in range(len(rows)):
            row = list(rows[i])
            for x, ch in enumerate(row):
                if ch in ("E", "B", "G", "N", "K", "V", "M", "U", "J"):
                    row[x] = "H" if ch in ("E", "B", "G", "K", "V", "M", "U", "J") else "T"
                if ch == "X":
                    row[x] = "."
            rows[i] = "".join(row)
        if character.get("back"):
            rows = overlay(rows, character["back"], 0)

    if direction == "right":
        lean = character.get("lean", 0)
        if lean:
            shifted: list[str] = []
            for row in rows:
                r = list(row)
                for _ in range(abs(lean)):
                    if lean > 0:
                        r = r[1:] + ["."]
                    else:
                        r = ["."] + r[:-1]
                shifted.append("".join(r))
            rows = shifted

    return rows[:10]


def draw(im: Image.Image, ox: int, oy: int, rows: list[str], colors: dict[str, str]) -> None:
    px = im.load()
    height = len(rows)
    top = oy + FRAME_H - 2 - height

    def put(x: int, y: int, hexcolor: str) -> None:
        if 0 <= x - ox < FRAME_W and 0 <= y - oy < FRAME_H:
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


# ── Grok: goth waifu — long hair, choker, cigarette, violet aura ────────────

GROK = {
    "name": "grok",
    "lean": 1,
    "colors": {
        "S": "#E8C4B8", "H": "#120A18", "E": "#F5F0FF", "B": "#7C5CFF",
        "F": "#D4A89A", "T": "#1A1028", "R": "#3A2050", "K": "#9B7CFF",
        "L": "#140C1C", "l": "#0A0610", "P": "#EDE9E0", "d": "#0A0610",
        "W": "#6B4CFF", "X": "#C8C0B0", "M": "#8A7068",
    },
    "base": [
        ".WWWWWWWWWWWWWW.",
        "..HHHHHHHHHHHH..",
        ".HHHEEEEEEEHHH..",
        ".HHHBHHMMHBHHH..",
        "..HHFFFFFFHHHH..",
        ".dHHTTTTTTTTHHd.",
        "..HTTTKKKKTTTH..",
        "..HTTTTTTTTTTH..",
        "..HHTTTTTTTHHH..",
        "..HHTTTTTTTHHH..",
    ],
    "type_extra": [
        ["................", ".X.............."],
        ["................", "..X............."],
    ],
    "back": [
        ".WWWWWWWWWWWWWW.",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
    ],
}

# ── Claude: nerd classique — lunettes, cravate orange, chemise crème ─────────

CLAUDE = {
    "name": "claude",
    "lean": 0,
    "colors": {
        "S": "#E8C8A8", "H": "#3D2E22", "E": "#F8F4EC", "B": "#1F1E1C",
        "F": "#D4B090", "T": "#EDE9E0", "N": "#D97757", "G": "#2B2926",
        "L": "#2B2926", "l": "#1F1E1C", "P": "#F5F0E8", "d": "#1F1E1C",
        "M": "#8A7060",
    },
    "base": [
        "................",
        "..HHHHHHHHHHHH..",
        "..HHEEEEEEHHHH..",
        "..HHBHGGBBHHHH..",
        "..HHFFFFFFHHHH..",
        ".dHHTTTTTTTTHHd.",
        "..HTTNNNNTTTTH..",
        "..HTTTTTTTTTTH..",
        "..HHTTTTTTTHHH..",
        "..HHTTTTTTTHHH..",
    ],
    "back": [
        "................",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
    ],
}

# ── Gemini: chevalier poète — heaume, armure, cape bleue, joyau doré ────────

GEMINI = {
    "name": "gemini",
    "lean": 0,
    "colors": {
        "S": "#E8C0A0", "H": "#6A5030", "E": "#F0E8D8", "B": "#2A2018",
        "F": "#C8A080", "A": "#6A7A9A", "C": "#4796E3", "V": "#8AA0C0",
        "L": "#4A5060", "l": "#2A3040", "P": "#F5E6C8", "d": "#2A3040",
        "W": "#C9A84C", "J": "#E8C040", "M": "#6A5040",
    },
    "base": [
        ".CCCCCCCCCCCCCC.",
        "..VVVVVVVVVVVV..",
        "..VVEEEEEEEVVV..",
        "..VVBVJJMVBVVV..",
        "..VVFFFFFFVVVV..",
        ".dVVAAAAAAAVVd.",
        "..VAAAAAAAACVV..",
        "..VAAAAAAAAAVV..",
        "..CCAAAAAAACCC..",
        "..CCAAAAAAACCC..",
    ],
    "back": [
        ".CCCCCCCCCCCCCC.",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
    ],
}

# ── Codex/Copilot: spectateur défait — hoodie vert, cernes, posture affaissée ─

CODEX = {
    "name": "codex",
    "lean": -1,
    "colors": {
        "S": "#E0B898", "H": "#5A4030", "E": "#F5F0E8", "B": "#2B2926",
        "F": "#C89878", "Y": "#10A37F", "U": "#8A7068", "L": "#3A4A40",
        "l": "#2A3830", "P": "#EDE9E0", "d": "#2B2926", "M": "#7A6050",
    },
    "base": [
        "................",
        "..HHHHHHHHHHHH..",
        "..HHEEEEEEHHHH..",
        "..HHBUHHUBHHHH..",
        "..HHFFFFFFHHHH..",
        ".dHHYYYYYYYHHd..",
        "..HYYYYYYYYYHH..",
        "..HYYYYYYYYYHH..",
        "..HHYYYYYYHHHH..",
        "..HHYYYYYYHHHH..",
    ],
    "type_extra": [
        ["................", "................"],
        ["................", "................"],
    ],
    "back": [
        "................",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
    ],
}

AGENTS = [GROK, CLAUDE, GEMINI, CODEX]


def build_sheet(agent: dict) -> Image.Image:
    im = Image.new("RGBA", (FRAME_W * COLS_PER_ROW, FRAME_H * 3), (0, 0, 0, 0))
    poses = [("walk", 0), ("walk", 1), ("walk", 2), ("type", 0), ("type", 1), ("read", 0), ("read", 1)]
    for dir_idx, direction in enumerate(["down", "up", "right"]):
        for col, (pose, frame) in enumerate(poses):
            rows = pose_rows(agent, pose, frame, direction)
            draw(im, col * FRAME_W, dir_idx * FRAME_H, rows, agent["colors"])
    return im


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for agent in AGENTS:
        path = OUT / f"agent_{agent['name']}.png"
        build_sheet(agent).save(path)
        print(f"wrote {path.name}")