"""HD floor (32×32) and wall (32×64) tiles."""

from __future__ import annotations

from PIL import Image, ImageDraw

from office_hd_util import TILE, TALL, rgb


def _parquet(draw: ImageDraw.ImageDraw, variant: int, base: str, alt: str, seam: str, hi: str) -> None:
    b, a, s, h = rgb(base), rgb(alt), rgb(seam), rgb(hi)
    for row in range(16):
        for col in range(16):
            x0, y0 = col * 2, row * 2
            fill = a if (col + row + variant) % 2 else b
            draw.rectangle((x0, y0, x0 + 1, y0 + 1), fill=fill)
            if col % 4 == 0:
                draw.point((x0, y0), fill=s)
            if (col + row) % 5 == 0:
                draw.point((x0 + 1, y0), fill=h)


def floor_tile(idx: int) -> Image.Image:
    themes = [
        ("#4A3E32", "#5A4A3A", "#3A3028", "#6A5848"),  # 0 centre warm
        ("#5A4A3A", "#6A5848", "#4A3E32", "#7A6858"),  # 1 centre light
        ("#3A3028", "#4A3E32", "#2A2218", "#5A4838"),  # 2 centre dark
        ("#6A5030", "#7A6040", "#5A4020", "#8A7050"),  # 3 library
        ("#2A1838", "#3A2850", "#1A1028", "#5A4078"),  # 4 gothic
        ("#5A6068", "#6A7078", "#4A5058", "#8A9098"),  # 5 stone
        ("#2A4840", "#3A5850", "#1A3830", "#4A6860"),  # 6 lounge
        ("#D4C4A8", "#E8D8BC", "#B8A888", "#F0E4CC"),  # 7 paper light
        ("#36302A", "#423830", "#2A241E", "#524840"),  # 8 paper dark
    ]
    base, alt, seam, hi = themes[idx % len(themes)]
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    _parquet(ImageDraw.Draw(im), idx, base, alt, seam, hi)
    if idx == 4:
        d = ImageDraw.Draw(im)
        for px, py in [(8, 8), (22, 14), (14, 22)]:
            d.point((px, py), fill=rgb("#9B7CFF"))
            d.point((px + 1, py), fill=rgb("#6B4CFF88"))
    if idx == 5:
        d = ImageDraw.Draw(im)
        d.line((16, 0, 16, 31), fill=rgb("#4A5058"))
        d.line((0, 16, 31, 16), fill=rgb("#4A5058"))
    return im


def wall_tile(mask: int) -> Image.Image:
    """Autotile wall piece — mask n/e/s/w nibble."""
    im = Image.new("RGBA", (TILE, TALL), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    n, e, s, w = mask & 1, mask & 2, mask & 4, mask & 8

    # Backing plaster
    d.rectangle((0, 0, 31, 63), fill=rgb("#EDE9E0"))
    # Wainscot panel
    d.rectangle((1, 34, 30, 62), fill=rgb("#A09890"))
    d.rectangle((2, 36, 29, 60), fill=rgb("#8A8078"))
    d.line((2, 48, 29, 48), fill=rgb("#6A6560"))
    # Chair rail
    d.rectangle((0, 32, 31, 34), fill=rgb("#6A5030"))
    d.rectangle((0, 30, 31, 31), fill=rgb("#8A7060"))

    # Upper wall tint
    d.rectangle((0, 0, 31, 29), fill=rgb("#F5F2EC"))

    # Edge shadows for connectivity
    if n:
        d.rectangle((0, 0, 31, 3), fill=rgb("#2B2926"))
        d.rectangle((0, 3, 31, 5), fill=rgb("#6A6560"))
    if s:
        d.rectangle((0, 58, 31, 63), fill=rgb("#3A3834"))
    if w:
        d.rectangle((0, 0, 3, 63), fill=rgb("#8A857C"))
        d.line((3, 0, 3, 63), fill=rgb("#6A6560"))
    if e:
        d.rectangle((28, 0, 31, 63), fill=rgb("#8A857C"))
        d.line((27, 0, 27, 63), fill=rgb("#6A6560"))

    # Corner highlights
    if n and w:
        d.point((4, 6), fill=rgb("#FFFFFF88"))
    if n and e:
        d.point((26, 6), fill=rgb("#FFFFFF66"))
    if not n and not s and not e and not w:
        # isolated pillar — all edges
        d.rectangle((0, 0, 31, 63), outline=rgb("#6A6560"))

    # Occasional window / art hint on some masks
    if mask in (0, 3, 5, 10):
        d.rectangle((8, 10, 23, 24), fill=rgb("#4796E344"))
        d.rectangle((9, 11, 22, 23), fill=rgb("#A8C8F088"))
        d.line((15, 11, 15, 23), fill=rgb("#6A8098"))
        d.line((9, 17, 22, 17), fill=rgb("#6A8098"))

    return im


def all_tiles() -> dict[str, Image.Image]:
    out: dict[str, Image.Image] = {}
    for i in range(9):
        out[f"floor_{i}"] = floor_tile(i)
    for m in range(16):
        out[f"wall_{m}"] = wall_tile(m)
    return out