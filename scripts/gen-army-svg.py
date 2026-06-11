#!/usr/bin/env python3
"""Generate .github/assets/army.svg : the animated clawd army.

Scene: 6 stations. Each station = a terminal tile (titlebar dots, state LED,
code lines that fill while typing) above a pixel clawd cycling the product's
state machine: idle -> notices laptop -> pulls it -> types (running) ->
approval pause -> types -> done -> back to idle. Station 4 hits an error
instead of approval, then retries. Token particles rise while typing.
Dark/light via prefers-color-scheme CSS inside the SVG.

Discrete SMIL frame swaps (calcMode=discrete) on a 32-tick timeline, 0.2s per
tick (6.4s loop), stations phase-shifted to read as a wave.
"""

TICKS = 32
TICK_S = 0.2
DUR = TICKS * TICK_S          # 6.4
STATIONS = 6
W, H = 1200, 240
PIXEL = 8                      # sprite grid pixel
CLAWD_Y = 116                  # sprite group y
ERROR_STATION = 3              # 0-based: this one errors then retries

ACCENT = "#d97757"
GREEN = "#3fb950"
AMBER = "#f5a524"
RED = "#f85149"
VIOLET = "#a78bfa"
GRAY = "#6e7681"
CLAY = "#CB7B5D"

KEYTIMES = ";".join(f"{i / TICKS:.5f}".rstrip("0").rstrip(".") if i else "0" for i in range(TICKS + 1))


def timeline(active: set[int]) -> str:
    """values string: 1 when tick in active, else 0; 33 entries (loop wraps)."""
    return ";".join("1" if (i % TICKS) in active else "0" for i in range(TICKS + 1))


def anim(active: set[int], begin: str) -> str:
    return (f'<animate attributeName="opacity" values="{timeline(active)}" '
            f'keyTimes="{KEYTIMES}" dur="{DUR}s" repeatCount="indefinite" '
            f'calcMode="discrete" begin="{begin}"/>')


# ── body frame schedule ──────────────────────────────────────────────────────
def frame_schedule() -> dict[str, set[int]]:
    s: dict[str, set[int]] = {k: set() for k in ("fi", "fs", "si", "p1", "p2", "ta", "tb", "tc")}
    for t in range(TICKS):
        if t in (0, 2):           f = "fi"
        elif t in (1, 3):         f = "fs"
        elif t in (4, 5):         f = "si"
        elif t == 6:              f = "p1"
        elif t == 7:              f = "p2"
        elif 8 <= t <= 21:        f = ("ta", "tb", "tc")[(t - 8) % 3]
        elif t in (22, 23):       f = "p2"
        elif 24 <= t <= 27:       f = ("ta", "tb", "tc")[(t - 24) % 3]
        elif t in (28, 29):       f = "si"
        else:                     f = "fi"          # 30, 31
        s[f].add(t)
    # sanity: exactly one frame per tick
    for t in range(TICKS):
        owners = [k for k, v in s.items() if t in v]
        assert len(owners) == 1, f"tick {t}: {owners}"
    return s


FRAMES = frame_schedule()
BLINK = {2, 31}
TYPING = set(range(8, 22)) | set(range(24, 28))
LED_GRAY = set(range(0, 8)) | {30, 31}
LED_RUN = TYPING
LED_PAUSE = {22, 23}            # amber (approval) or red (error station)
LED_DONE = {28, 29}
LINES = [  # (appear_tick, width, segments [(dx, w, color)])
    (9,  [(0, 18, ACCENT), (22, 78, GRAY)]),
    (12, [(0, 30, GRAY), (34, 86, "#8b949e")]),
    (15, [(0, 18, VIOLET), (22, 52, GRAY)]),
    (18, [(0, 44, "#8b949e"), (48, 58, GRAY)]),
]
DONE_LINE = (26, [(0, 14, GREEN), (18, 64, GREEN)])
ERR_LINE = ({22, 23}, [(0, 14, RED), (18, 80, RED)])
LINE_CLEAR = 30                 # lines visible appear..29

# ── sprite defs (pixel clawd, 22x10 grid), verbatim from the original asset ──
SPRITES = """
    <symbol id="f-fi" viewBox="0 0 22 10" overflow="visible">
      <rect x="6" y="1" width="9" height="1" fill="{c}"/><rect x="6" y="2" width="2" height="1" fill="{c}"/><rect x="8" y="2" width="1" height="1" fill="#000000"/><rect x="9" y="2" width="2" height="1" fill="{c}"/><rect x="11" y="2" width="1" height="1" fill="#000000"/><rect x="12" y="2" width="3" height="1" fill="{c}"/><rect x="4" y="3" width="13" height="2" fill="{c}"/><rect x="6" y="5" width="9" height="1" fill="{c}"/><rect x="6" y="6" width="1" height="2" fill="{c}"/><rect x="9" y="6" width="1" height="2" fill="{c}"/><rect x="12" y="6" width="1" height="2" fill="{c}"/><rect x="14" y="6" width="1" height="2" fill="{c}"/>
    </symbol>
    <symbol id="f-fs" viewBox="0 0 22 10" overflow="visible">
      <rect x="7" y="1" width="7" height="1" fill="{c}"/><rect x="6" y="2" width="2" height="1" fill="{c}"/><rect x="8" y="2" width="1" height="1" fill="#000000"/><rect x="9" y="2" width="2" height="1" fill="{c}"/><rect x="11" y="2" width="1" height="1" fill="#000000"/><rect x="12" y="2" width="3" height="1" fill="{c}"/><rect x="4" y="3" width="13" height="2" fill="{c}"/><rect x="6" y="5" width="9" height="1" fill="{c}"/><rect x="6" y="6" width="1" height="2" fill="{c}"/><rect x="9" y="6" width="1" height="2" fill="{c}"/><rect x="12" y="6" width="1" height="2" fill="{c}"/><rect x="14" y="6" width="1" height="2" fill="{c}"/>
    </symbol>
    <symbol id="f-si" viewBox="0 0 22 10" overflow="visible">
      <rect x="6" y="1" width="8" height="1" fill="{c}"/><rect x="6" y="2" width="2" height="1" fill="{c}"/><rect x="8" y="2" width="1" height="1" fill="#000000"/><rect x="9" y="2" width="4" height="1" fill="{c}"/><rect x="13" y="2" width="1" height="1" fill="#000000"/><rect x="3" y="3" width="12" height="2" fill="{c}"/><rect x="15" y="3" width="1" height="1" fill="#8B8B8B"/><rect x="15" y="4" width="2" height="1" fill="#8B8B8B"/><rect x="3" y="5" width="11" height="1" fill="{c}"/><rect x="14" y="5" width="3" height="1" fill="#8B8B8B"/><rect x="6" y="6" width="1" height="3" fill="{c}"/><rect x="9" y="6" width="1" height="2" fill="{c}"/><rect x="12" y="6" width="1" height="2" fill="{c}"/>
    </symbol>
    <symbol id="f-p1" viewBox="0 0 22 10" overflow="visible">
      <rect x="4" y="1" width="8" height="1" fill="{c}"/><rect x="4" y="2" width="2" height="1" fill="{c}"/><rect x="6" y="2" width="1" height="1" fill="#000000"/><rect x="7" y="2" width="4" height="1" fill="{c}"/><rect x="11" y="2" width="1" height="1" fill="#000000"/><rect x="1" y="3" width="12" height="2" fill="{c}"/><rect x="17" y="4" width="2" height="1" fill="#8B8B8B"/><rect x="1" y="5" width="11" height="1" fill="{c}"/><rect x="16" y="5" width="3" height="1" fill="#8B8B8B"/><rect x="15" y="6" width="4" height="1" fill="#8B8B8B"/><rect x="4" y="6" width="1" height="3" fill="{c}"/><rect x="7" y="6" width="1" height="2" fill="{c}"/><rect x="10" y="6" width="1" height="2" fill="{c}"/>
    </symbol>
    <symbol id="f-p2" viewBox="0 0 22 10" overflow="visible">
      <rect x="4" y="1" width="8" height="1" fill="{c}"/><rect x="4" y="2" width="2" height="1" fill="{c}"/><rect x="6" y="2" width="1" height="1" fill="#000000"/><rect x="7" y="2" width="4" height="1" fill="{c}"/><rect x="11" y="2" width="1" height="1" fill="#000000"/><rect x="14" y="2" width="3" height="1" fill="#8B8B8B"/><rect x="1" y="3" width="12" height="2" fill="{c}"/><rect x="14" y="3" width="1" height="1" fill="#8B8B8B"/><rect x="15" y="3" width="2" height="1" fill="#BBBBBB"/><rect x="17" y="3" width="1" height="1" fill="#8B8B8B"/><rect x="14" y="4" width="4" height="2" fill="#8B8B8B"/><rect x="1" y="5" width="11" height="1" fill="{c}"/><rect x="4" y="6" width="1" height="3" fill="{c}"/><rect x="7" y="6" width="1" height="2" fill="{c}"/><rect x="10" y="6" width="1" height="2" fill="{c}"/>
    </symbol>
    <symbol id="f-ta" viewBox="0 0 22 10" overflow="visible">
      <rect x="3" y="1" width="8" height="1" fill="{c}"/><rect x="3" y="2" width="2" height="1" fill="{c}"/><rect x="5" y="2" width="1" height="1" fill="#000000"/><rect x="6" y="2" width="4" height="1" fill="{c}"/><rect x="10" y="2" width="1" height="1" fill="#000000"/><rect x="13" y="2" width="3" height="1" fill="#8B8B8B"/><rect x="0" y="3" width="12" height="2" fill="{c}"/><rect x="13" y="3" width="1" height="1" fill="#8B8B8B"/><rect x="14" y="3" width="2" height="1" fill="#BBBBBB"/><rect x="16" y="3" width="1" height="1" fill="#8B8B8B"/><rect x="13" y="4" width="4" height="2" fill="#8B8B8B"/><rect x="0" y="5" width="11" height="1" fill="{c}"/><rect x="3" y="6" width="1" height="3" fill="{c}"/><rect x="6" y="6" width="1" height="2" fill="{c}"/><rect x="9" y="6" width="1" height="2" fill="{c}"/><rect x="14" y="6" width="1" height="1" fill="#8B8B8B"/><rect x="13" y="7" width="1" height="1" fill="#8B8B8B"/>
    </symbol>
    <symbol id="f-tb" viewBox="0 0 22 10" overflow="visible">
      <rect x="3" y="1" width="8" height="1" fill="{c}"/><rect x="3" y="2" width="2" height="1" fill="{c}"/><rect x="5" y="2" width="1" height="1" fill="#000000"/><rect x="6" y="2" width="4" height="1" fill="{c}"/><rect x="10" y="2" width="1" height="1" fill="#000000"/><rect x="13" y="2" width="3" height="1" fill="#8B8B8B"/><rect x="0" y="3" width="12" height="2" fill="{c}"/><rect x="13" y="3" width="1" height="1" fill="#8B8B8B"/><rect x="14" y="3" width="2" height="1" fill="#BBBBBB"/><rect x="16" y="3" width="1" height="1" fill="#8B8B8B"/><rect x="13" y="4" width="4" height="2" fill="#8B8B8B"/><rect x="0" y="5" width="11" height="1" fill="{c}"/><rect x="3" y="6" width="1" height="3" fill="{c}"/><rect x="6" y="6" width="1" height="2" fill="{c}"/><rect x="9" y="6" width="1" height="2" fill="{c}"/><rect x="13" y="6" width="1" height="1" fill="#8B8B8B"/><rect x="14" y="7" width="1" height="1" fill="#8B8B8B"/>
    </symbol>
    <symbol id="f-tc" viewBox="0 0 22 10" overflow="visible">
      <rect x="3" y="1" width="8" height="1" fill="{c}"/><rect x="3" y="2" width="2" height="1" fill="{c}"/><rect x="5" y="2" width="1" height="1" fill="#000000"/><rect x="6" y="2" width="4" height="1" fill="{c}"/><rect x="10" y="2" width="1" height="1" fill="#000000"/><rect x="11" y="2" width="3" height="1" fill="#8B8B8B"/><rect x="0" y="3" width="12" height="2" fill="{c}"/><rect x="12" y="3" width="1" height="1" fill="#8B8B8B"/><rect x="13" y="3" width="2" height="1" fill="#BBBBBB"/><rect x="15" y="3" width="1" height="1" fill="#8B8B8B"/><rect x="12" y="4" width="4" height="2" fill="#8B8B8B"/><rect x="0" y="5" width="11" height="1" fill="{c}"/><rect x="3" y="6" width="1" height="3" fill="{c}"/><rect x="6" y="6" width="1" height="2" fill="{c}"/><rect x="9" y="6" width="1" height="2" fill="{c}"/><rect x="12" y="6" width="1" height="1" fill="#8B8B8B"/><rect x="13" y="7" width="1" height="1" fill="#8B8B8B"/>
    </symbol>
""".replace("{c}", CLAY)


def station(k: int) -> str:
    sx = 12 + 200 * k
    begin = f"-{k * DUR / STATIONS:.3f}s" if k else "0s"
    err = k == ERROR_STATION
    out: list[str] = [f'<!-- station {k + 1} -->']

    # ── terminal tile ──
    tx, ty, tw, th = sx + 12, 10, 152, 78
    out.append(f'<g>')
    out.append(f'<rect x="{tx}" y="{ty}" width="{tw}" height="{th}" class="frame"/>')
    out.append(f'<rect x="{tx + 2}" y="{ty + 2}" width="{tw - 4}" height="{th - 4}" class="tile"/>')
    out.append(f'<rect x="{tx + 2}" y="{ty + 16}" width="{tw - 4}" height="2" class="frame"/>')
    for i, dc in enumerate(("#ff5f57", "#febc2e", "#28c840")):
        out.append(f'<rect x="{tx + 8 + i * 9}" y="{ty + 6}" width="5" height="5" fill="{dc}"/>')
    # state LED (top right): gray / running(pulse) / pause(amber|red) / done
    lx, ly = tx + tw - 14, ty + 6
    led = lambda color: f'<rect x="{lx}" y="{ly}" width="6" height="6" fill="{color}"/>'
    out.append(f'<g opacity="0">{led(GRAY)}{anim(LED_GRAY, begin)}</g>')
    pulse_rect = (f'<rect x="{lx}" y="{ly}" width="6" height="6" fill="{ACCENT}">'
                  f'<animate attributeName="opacity" values="1;0.35;1" dur="0.6s" repeatCount="indefinite" begin="{begin}"/>'
                  f'</rect>')
    out.append(f'<g opacity="0">{pulse_rect}{anim(LED_RUN, begin)}</g>')
    out.append(f'<g opacity="0">{led(RED if err else AMBER)}{anim(LED_PAUSE, begin)}</g>')
    out.append(f'<g opacity="0">{led(GREEN)}{anim(LED_DONE, begin)}</g>')

    # code lines
    ly0 = ty + 24
    for li, (appear, segs) in enumerate(LINES):
        active = set(range(appear, LINE_CLEAR))
        row = "".join(f'<rect x="{tx + 8 + dx}" y="{ly0 + li * 10}" width="{w}" height="5" fill="{c}"/>'
                      for dx, w, c in segs)
        out.append(f'<g opacity="0">{row}{anim(active, begin)}</g>')
    # slot 5: error line (station 4 only) then done line
    y5 = ly0 + 4 * 10
    if err:
        row = "".join(f'<rect x="{tx + 8 + dx}" y="{y5}" width="{w}" height="5" fill="{c}"/>'
                      for dx, w, c in ERR_LINE[1])
        out.append(f'<g opacity="0">{row}{anim(ERR_LINE[0], begin)}</g>')
    appear, segs = DONE_LINE
    row = "".join(f'<rect x="{tx + 8 + dx}" y="{y5}" width="{w}" height="5" fill="{c}"/>'
                  for dx, w, c in segs)
    out.append(f'<g opacity="0">{row}{anim(set(range(appear, LINE_CLEAR)), begin)}</g>')
    out.append('</g>')

    # ── token particles (rise from laptop to tile while typing) ──
    px = sx + 118
    out.append(f'<g opacity="0">{anim(TYPING, begin)}'
               + "".join(
                   f'<g transform="translate({px + dx} 150)">'
                   f'<rect x="0" y="0" width="{sz}" height="{sz}" fill="{c}" opacity="0">'
                   f'<animate attributeName="opacity" values="0;0.9;0" keyTimes="0;0.3;1" dur="1.35s" repeatCount="indefinite" begin="-{off}s"/>'
                   f'</rect>'
                   f'<animateTransform attributeName="transform" type="translate" additive="sum" '
                   f'values="0 0;0 -54" dur="1.35s" repeatCount="indefinite" begin="-{off}s"/>'
                   f'</g>'
                   for dx, sz, c, off in ((0, 5, ACCENT, 0.0), (10, 4, GREEN, 0.45), (-8, 6, VIOLET, 0.9)))
               + '</g>')

    # ── clawd body frames ──
    out.append(f'<g transform="translate({sx} {CLAWD_Y})">')
    for fid, active in FRAMES.items():
        out.append(f'<use href="#f-{fid}" width="176" height="80" opacity="0">{anim(active, begin)}</use>')
    # blink overlay (front frames only: eyes at grid 8,2 and 11,2)
    blink = (f'<rect x="{8 * PIXEL}" y="{2 * PIXEL}" width="{PIXEL}" height="{PIXEL}" fill="{CLAY}"/>'
             f'<rect x="{11 * PIXEL}" y="{2 * PIXEL}" width="{PIXEL}" height="{PIXEL}" fill="{CLAY}"/>')
    out.append(f'<g opacity="0">{blink}{anim(BLINK, begin)}</g>')
    out.append('</g>')
    return "\n".join(out)


def build() -> str:
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="100%" '
        f'shape-rendering="crispEdges" role="img" '
        f'aria-label="Six pixel clawds pull laptops and type; a terminal tile above each one fills with code and walks the idle, running, approval, done state machine">',
        '<style>',
        ':root{--bg:#0d1117;--tile:#161b22;--frame:#30363d;--floor:#21262d;}',
        '@media (prefers-color-scheme: light){:root{--bg:#ffffff;--tile:#f6f8fa;--frame:#d0d7de;--floor:#eaeef2;}}',
        '.bg{fill:var(--bg);}.tile{fill:var(--tile);}.frame{fill:var(--frame);}.floor{fill:var(--floor);}',
        '</style>',
        f'<defs>{SPRITES}</defs>',
        f'<rect width="{W}" height="{H}" class="bg"/>',
        f'<rect y="202" width="{W}" height="2" class="floor"/>',
    ]
    for k in range(STATIONS):
        parts.append(station(k))
    parts.append('</svg>')
    return "\n".join(parts)


if __name__ == "__main__":
    import pathlib, xml.etree.ElementTree as ET
    svg = build()
    ET.fromstring(svg)  # well-formedness gate
    out = pathlib.Path(__file__).resolve().parent.parent / ".github/assets/army.svg"
    out.write_text(svg, encoding="utf-8")
    print(f"wrote {out} ({len(svg) / 1024:.1f} KB)")
