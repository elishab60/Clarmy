#!/usr/bin/env python3
"""Brand wall posters — 128×256 frames with real logos from refs/posters/*.png."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from office_hd_util import ROOT, rgb

REFS = ROOT / "refs" / "posters"
POSTER_W, POSTER_H = 128, 256

POSTERS: list[tuple[str, str, str, str, str]] = [
    ("POSTER_DEEPSEEK", "deepseek.png", "#4796E3", "#E8F2FC", "DEEPSEEK", "coding assistant"),
    ("POSTER_QWEN", "qwen.png", "#9B7CFF", "#F4F0FF", "QWEN", "Alibaba Cloud"),
    ("POSTER_KIMI", "kimi.png", "#00A0FF", "#FAFAFA", "KIMI", "Moonshot AI"),
]

FONT_CANDIDATES = (
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
)


def trim_alpha(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    box = im.getbbox()
    return im.crop(box) if box else im


def fit_logo(logo: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    x0, y0, x1, y1 = box
    tw, th = x1 - x0, y1 - y0
    logo = trim_alpha(logo)
    lw, lh = logo.size
    scale = min(tw / lw, th / lh)
    nw, nh = max(1, int(lw * scale)), max(1, int(lh * scale))
    scaled = logo.resize((nw, nh), Image.LANCZOS)
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    out.paste(scaled, ((tw - nw) // 2, (th - nh) // 2), scaled)
    return out


def load_font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    paths = FONT_CANDIDATES if bold else tuple(reversed(FONT_CANDIDATES))
    for path in paths:
        p = Path(path)
        if not p.exists():
            continue
        try:
            return ImageFont.truetype(str(p), size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_frame(d: ImageDraw.ImageDraw, accent: str, inner: str) -> None:
    d.rectangle((0, 8, POSTER_W - 1, POSTER_H - 1), fill=rgb("#3D2E22"))
    d.rectangle((4, 12, POSTER_W - 5, POSTER_H - 5), fill=rgb("#5A4030"))
    d.rectangle((8, 16, POSTER_W - 9, POSTER_H - 9), fill=rgb("#2B2926"))
    d.rectangle((12, 24, POSTER_W - 13, POSTER_H - 21), fill=rgb(inner))
    d.rectangle((12, 24, POSTER_W - 13, POSTER_H - 21), outline=rgb(accent), width=2)
    d.ellipse((56, 12, 72, 28), fill=rgb("#8A857C"))
    d.ellipse((60, 16, 68, 24), fill=rgb("#EDE9E0"))


def compose_poster(
    logo_path: Path,
    accent: str,
    inner: str,
    title: str,
    subtitle: str,
) -> Image.Image:
    poster = Image.new("RGBA", (POSTER_W, POSTER_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(poster)
    draw_frame(d, accent, inner)

    logo = fit_logo(Image.open(logo_path), (16, 36, POSTER_W - 17, 176))
    poster.alpha_composite(logo, (16, 36))

    d.rectangle((20, 184, POSTER_W - 21, 216), fill=rgb(accent))
    d.rectangle((24, 188, POSTER_W - 25, 212), fill=rgb("#1A1816"))

    title_font = load_font(14)
    sub_font = load_font(10, bold=False)
    d.text((28, 190), title, fill=rgb("#FFFFFF"), font=title_font)
    d.text((28, 206), subtitle, fill=rgb("#C8D8E8"), font=sub_font)

    return poster


def all_posters() -> dict[str, Image.Image]:
    out: dict[str, Image.Image] = {}
    for frame_name, filename, accent, inner, title, subtitle in POSTERS:
        src = REFS / filename
        if not src.exists():
            raise FileNotFoundError(f"missing ref logo: {src}")
        out[frame_name] = compose_poster(src, accent, inner, title, subtitle)
    return out