"""HD themed decor — hand-drawn 2× pixel props."""

from __future__ import annotations

from PIL import Image, ImageDraw

from office_hd_util import TILE, TALL, paint_grid, rgb


def skull_candle() -> Image.Image:
    im = Image.new("RGBA", (TILE, TALL), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Candle body
    d.rounded_rectangle((12, 4, 19, 28), radius=2, fill=rgb("#EDE9E0"))
    d.rectangle((13, 2, 18, 6), fill=rgb("#F5E6C8"))
    d.ellipse((13, 0, 18, 4), fill=rgb("#D97757"))
    d.point((15, 1), fill=rgb("#FFCC6688"))
    d.point((16, 0), fill=rgb("#FFFFFFAA"))
    # Wax drips
    d.point((12, 14), fill=rgb("#D8D2C8"))
    d.point((19, 18), fill=rgb("#D8D2C8"))
    # Skull
    d.ellipse((6, 30, 25, 52), fill=rgb("#F0ECE4"))
    d.ellipse((6, 30, 25, 52), outline=rgb("#C8C0B8"))
    d.ellipse((10, 38, 14, 44), fill=rgb("#1A1816"))
    d.ellipse((17, 38, 21, 44), fill=rgb("#1A1816"))
    d.point((13, 43), fill=rgb("#9B7CFF"))
    d.point((18, 43), fill=rgb("#9B7CFF"))
    d.arc((11, 44, 20, 50), 10, 170, fill=rgb("#1A1816"))
    # Glow
    d.ellipse((10, 52, 21, 60), fill=rgb("#9B7CFF33"))
    d.point((15, 56), fill=rgb("#C4B0FF88"))
    return im


def gothic_altar() -> Image.Image:
    im = Image.new("RGBA", (TILE, TALL), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Base steps
    d.rectangle((4, 50, 27, 62), fill=rgb("#1A1020"))
    d.rectangle((6, 46, 25, 52), fill=rgb("#2A1838"))
    d.rectangle((8, 40, 23, 48), fill=rgb("#1A1020"))
    # Pillar
    d.rectangle((10, 18, 21, 42), fill=rgb("#2A1838"))
    d.line((10, 18, 10, 42), fill=rgb("#6B4CFF"))
    d.line((21, 18, 21, 42), fill=rgb("#4A3088"))
    # Top slab
    d.rectangle((6, 12, 25, 20), fill=rgb("#3A2050"))
    d.rectangle((8, 8, 23, 14), fill=rgb("#4A2868"))
    # Sacred orb
    d.ellipse((11, 22, 20, 31), fill=rgb("#EDE9E0"))
    d.ellipse((12, 23, 19, 30), fill=rgb("#9B7CFF44"))
    d.point((14, 26), fill=rgb("#1A1816"))
    d.point((17, 26), fill=rgb("#1A1816"))
    # Purple flame
    d.polygon([(15, 2), (12, 8), (18, 8)], fill=rgb("#9B7CFF"))
    d.point((15, 4), fill=rgb("#EDE9E0"))
    return im


def gothic_rug() -> Image.Image:
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 31, 31), fill=rgb("#1E1028"))
    d.rectangle((3, 3, 28, 28), fill=rgb("#2A1838"))
    d.rectangle((6, 6, 25, 25), fill=rgb("#3A2050"))
    # Ornate border
    for i in range(7, 25, 4):
        d.point((i, 7), fill=rgb("#9B7CFF"))
        d.point((i, 24), fill=rgb("#9B7CFF"))
        d.point((7, i), fill=rgb("#6B4CFF"))
        d.point((24, i), fill=rgb("#6B4CFF"))
    # Centre sigil
    d.ellipse((11, 11, 20, 20), outline=rgb("#9B7CFF"))
    d.point((15, 15), fill=rgb("#EDE9E0"))
    d.point((14, 14), fill=rgb("#C4B0FF"))
    d.point((16, 16), fill=rgb("#C4B0FF"))
    return im


def stone_floor() -> Image.Image:
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cols = [("#6A7078", "#5A6068"), ("#707880", "#606870"), ("#5A6068", "#4A5058")]
    for row in range(2):
        for col in range(2):
            x0, y0 = col * 16, row * 16
            base, shade = cols[(row + col) % 3]
            d.rectangle((x0, y0, x0 + 15, y0 + 15), fill=rgb(base))
            d.line((x0, y0, x0 + 15, y0), fill=rgb(shade))
            d.line((x0, y0, x0, y0 + 15), fill=rgb(shade))
            d.point((x0 + 8, y0 + 8), fill=rgb("#4A5058"))
            d.point((x0 + 4, y0 + 11), fill=rgb("#8A9098AA"))
    d.line((16, 0, 16, 31), fill=rgb("#3A4048"))
    d.line((0, 16, 31, 16), fill=rgb("#3A4048"))
    return im


def rug_wood() -> Image.Image:
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 31, 31), fill=rgb("#5A4030"))
    for i in range(0, 32, 4):
        d.line((i, 0, i, 31), fill=rgb("#4A3020"))
    d.rectangle((6, 6, 25, 25), fill=rgb("#6A5030"))
    d.rectangle((8, 8, 23, 23), fill=rgb("#7A6040"))
    d.rectangle((10, 10, 21, 21), fill=rgb("#5A4030"))
    # Fringe
    for i in range(8, 24, 2):
        d.point((i, 6), fill=rgb("#8A7060"))
        d.point((i, 25), fill=rgb("#8A7060"))
    return im


def popcorn() -> Image.Image:
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Striped bucket
    d.rectangle((8, 18, 23, 30), fill=rgb("#EDE9E0"))
    d.rectangle((8, 18, 23, 30), outline=rgb("#D97757"))
    for i in range(10, 22, 3):
        d.line((i, 18, i, 30), fill=rgb("#D9775788"))
    d.rectangle((7, 28, 24, 31), fill=rgb("#D97757"))
    # Popcorn mound
    clusters = [(10, 14), (14, 12), (18, 13), (12, 10), (16, 9), (20, 11), (14, 7), (18, 8)]
    for cx, cy in clusters:
        d.ellipse((cx, cy, cx + 5, cy + 5), fill=rgb("#F5E6C8"))
        d.point((cx + 2, cy + 1), fill=rgb("#FFFFFFAA"))
    d.point((15, 6), fill=rgb("#FFFFFF"))
    return im


def knight_banner() -> Image.Image:
    im = Image.new("RGBA", (TILE, TALL), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((14, 0, 17, 18), fill=rgb("#6A5030"))
    d.polygon([(2, 18), (29, 18), (25, 58), (6, 58)], fill=rgb("#4796E3"))
    d.polygon([(6, 22), (25, 22), (22, 54), (9, 54)], fill=rgb("#2A6090"))
    d.rectangle((10, 26, 21, 42), fill=rgb("#C9A84C"))
    d.ellipse((13, 30, 18, 38), fill=rgb("#2A3040"))
    d.point((15, 33), fill=rgb("#EDE9E0"))
    return im


def armor_stand() -> Image.Image:
    im = Image.new("RGBA", (TILE, TALL), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((12, 54, 19, 62), fill=rgb("#6A5030"))
    d.rectangle((8, 22, 23, 50), fill=rgb("#7A8AAA"))
    d.rectangle((10, 10, 21, 24), fill=rgb("#9AA8C0"))
    d.rectangle((12, 30, 19, 36), fill=rgb("#C9A84C"))
    d.line((10, 22, 21, 22), fill=rgb("#5A6A88"))
    d.ellipse((11, 12, 20, 20), fill=rgb("#B8C0D0"))
    return im


def tv_screen() -> Image.Image:
    im = Image.new("RGBA", (TILE, TALL), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 4, 31, 44), radius=3, fill=rgb("#1A2820"))
    d.rectangle((4, 8, 27, 38), fill=rgb("#0A1810"))
    for i, col in enumerate(["#4796E3", "#D97757", "#7C9A6E"]):
        d.rectangle((6 + i * 8, 14, 12 + i * 8, 32), fill=rgb(col))
    d.rectangle((10, 46, 21, 54), fill=rgb("#2B2926"))
    d.rectangle((6, 54, 25, 58), fill=rgb("#3A3834"))
    return im


def spectator_chair() -> Image.Image:
    im = Image.new("RGBA", (TILE, TALL), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((4, 26, 27, 40), radius=2, fill=rgb("#3A4A40"))
    d.rectangle((6, 38, 25, 46), fill=rgb("#2A3830"))
    d.rounded_rectangle((6, 8, 25, 28), radius=2, fill=rgb("#10A37F"))
    d.rectangle((8, 12, 23, 24), fill=rgb("#0A8060"))
    return im


def bookshelf_fancy() -> Image.Image:
    im = Image.new("RGBA", (TILE, TALL), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 2, 31, 62), fill=rgb("#6A5030"), outline=rgb("#3D2E22"))
    colors = ["#D97757", "#7C9A6E", "#4796E3", "#9B7CFF", "#C9924D", "#B4554A"]
    for row, cy in enumerate([10, 24, 38, 52]):
        d.line((2, cy, 29, cy), fill=rgb("#3D2E22"))
        for i, cx in enumerate([4, 10, 16, 22]):
            d.rectangle((cx, cy - 8, cx + 5, cy - 2), fill=rgb(colors[(row + i) % len(colors)]))
            d.point((cx + 2, cy - 6), fill=rgb("#EDE9E088"))
    return im


def library_lamp() -> Image.Image:
    im = Image.new("RGBA", (TILE, TALL), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((14, 22, 17, 60), fill=rgb("#6A5030"))
    d.polygon([(6, 22), (25, 22), (22, 10), (9, 10)], fill=rgb("#D97757"))
    d.ellipse((4, 2, 27, 14), fill=rgb("#F5E6C8"))
    d.ellipse((8, 4, 23, 12), fill=rgb("#FFFFFF44"))
    d.point((15, 6), fill=rgb("#FFFFFFAA"))
    return im


def all_decor() -> dict[str, Image.Image]:
    return {
        "SKULL_CANDLE": skull_candle(),
        "GOTHIC_ALTAR": gothic_altar(),
        "GOTHIC_RUG": gothic_rug(),
        "STONE_FLOOR": stone_floor(),
        "RUG_WOOD": rug_wood(),
        "POPCORN": popcorn(),
        "KNIGHT_BANNER": knight_banner(),
        "ARMOR_STAND": armor_stand(),
        "TV_SCREEN": tv_screen(),
        "SPECTATOR_CHAIR": spectator_chair(),
        "BOOKSHELF_FANCY": bookshelf_fancy(),
        "LIBRARY_LAMP": library_lamp(),
    }