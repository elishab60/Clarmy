---
name: office-sprite-pipeline
description: >
  Generate uniform pixel-art office character sprite sheets (agent_*.png, 7×3 grid)
  via the headless `grok` CLI image tools, reference-first for stable identity, then
  the street_gooners-style post-process (green key, autofit, palette lock, audit).
  Use when asked to (re)generate office sprites, planches d'assets, Anni/Annie/Grok
  frames, /office-sprites.
metadata:
  short-description: "Reference-first Grok image_edit sprite pipeline for /office characters"
---

# Office Sprite Pipeline (Grok image_edit, reference-first)

Adapts the Street Gooners sprite pipeline to the Cockpit office Phaser sheet
(`public/office/characters/agent_<sprite>.png`, 7 cols × 3 rows = down/up/right).

## The fix (why the old version made crap)

The previous flow called a `GenerateImage` step **without a reference**, so the
character drifted every frame (different face/outfit/proportions). Now we drive the
`grok` CLI headless with **`image_edit` from a fixed identity seed** every frame:
identity stays locked, only the pose changes. This is the whole point — reference-first.

## Source of truth

- `scripts/sprite/config/sprite.json` — sizes, chroma, per-character `style` + `seed` + `paletteFrom`. Read: `python3 scripts/sprite/spritecfg.py nativeWidth`.
- `scripts/sprite/config/anims-<character>.json` — the 21 frames (index, pose, action, direction).

## Connector

`scripts/sprite/grok_imagegen.py` drives `grok` headless (subscription auth in `~/.grok`, NOT the paid xAI API):
- no `--input` → `image_gen` tool (fresh image)
- `--input ref.png` (repeatable) → `image_edit` tool (**use this**, identity-stable)
- grok writes to `~/.grok/sessions/<cwd-enc>/<sid>/images/N.jpg`; the connector finds it and converts to the `--output` PNG.

```bash
python3 scripts/sprite/grok_imagegen.py --input refs/anni/seed-front.png \
  --output out.png --cwd "$(pwd)" --prompt "..."
```

## Workflow

### 0. Identity seeds (once per character) — ONE PER VIEW
A clean full-body sprite on pure chroma green `#00ff00` per direction, used as the
edit anchor. A front seed RESISTS turning, so make three: front/back/side. gen_grok
picks `seed-front` (down), `seed-back` (up), `seed-side` (right) automatically.
```bash
# front, from the rough ref
python3 scripts/sprite/grok_imagegen.py --input refs/anni/ref-chibi.png \
  --output refs/anni/seed-front.png --cwd "$(pwd)" \
  --prompt "Redraw THIS exact character, single full-body pixel-art sprite, neutral front view, solid pure chroma green #00ff00 background, all hair inside frame with margin, ~85% height, crisp pixels, no text."
# back + side, edited FROM seed-front (identity stays locked)
python3 scripts/sprite/grok_imagegen.py --input refs/anni/seed-front.png \
  --output refs/anni/seed-back.png --cwd "$(pwd)" \
  --prompt "Redraw THIS character STRICTLY FROM BEHIND (back of head + pigtails, no face), same outfit/colors, full body neutral, pure chroma green #00ff00 bg, ~85% height, crisp pixels, no text."
python3 scripts/sprite/grok_imagegen.py --input refs/anni/seed-front.png \
  --output refs/anni/seed-side.png --cwd "$(pwd)" \
  --prompt "Redraw THIS character in STRICT RIGHT-SIDE PROFILE (body turned 90deg facing right, not front, not 3/4), same identity, full body neutral, pure chroma green #00ff00 bg, ~85% height, crisp pixels, no text."
```
Eyeball all three before continuing. A bad seed poisons its whole row.

### 1. Generate frames (per-frame image_edit)
```bash
python3 scripts/sprite/gen_grok.py --character anni --row down   # one direction (7 frames)
python3 scripts/sprite/gen_grok.py --character anni --frames 0,1 # specific indices
python3 scripts/sprite/gen_grok.py --character anni --all        # all 21
```
Each frame: image_edit from the seed → green-key (`post_clean`) → `autofit` stable → pixelize → `tmp/sprites/<c>/frames/frame-NNN.png`. Seated indices `{3,4,10,11,17,18}` get nudged down (desk hides legs). ~1–3 min per grok call; run a row at a time / in the background for the full set.

### 2. Assemble the sheet — HIGH DETAIL (preferred)
`gen_grok.py` already wrote frames, but the best quality comes from re-processing the
SAVED RAWS (`tmp/sprites/<c>/raw/`) with a gentle key + interior hole-fill at native
256×512, NO pixelize/quantize crunch (those ate detail + punched fishnet holes):
```bash
python3 scripts/sprite/reprocess.py --character anni   # raws -> frames -> sheet + detail montage
```
This is free (no Grok calls): iterate on key/hole-fill/scale here, not by regenerating.
It also exports per-frame raw+processed PNGs to `public/office/anni-detail/` for the
detail page. Missing frames stay transparent, so partial rows assemble fine.

Legacy quantized path (smaller, palette-locked, lower detail):
`bash scripts/sprite/gen_office_sheet.sh anni`.

### 3. Sync Phaser display scale
```bash
python3 scripts/sprite/display_scale.py --ts   # prints the agents.ts grok entry
```
Update `AGENT_SHEET.grok` in `src/components/views/office/game/agents.ts` if native dims changed.

### 4. Validate in the browser
```bash
node scripts/serve-office-gallery.mjs   # :3011
```
- `http://127.0.0.1:3011/validate-sprites.html?agent=grok` — plays the real sheet with the runtime frame indices + framerates (walk/type/read × down/up/right + flip).
- `http://127.0.0.1:3011/validate-grok-detail.html` — raw vs processed per frame, big, checkerboard bg to spot holes (reads `public/office/anni-detail/`).
- In-game: hard-refresh `/office`.

## Known limits / tuning

- `image_edit` locks identity but **varies pose weakly** — walk_a/walk_n/walk_b can look near-identical. For readable walking, push leg wording hard in the action, or accept subtle (the character still glides across tiles). Typing/reading poses differ clearly.
- Back (up) / profile (right) from a front seed snap to front → SOLVED by per-view seeds (`seed-back`/`seed-side`); gen_grok picks by direction.
- Fishnets/lace let the green show through → `reprocess.py` hole-fill closes the speckles. A filled hole can go dark (e.g. a patch on a thigh); raise the hole-fill neighbor threshold or lower passes if it overfills.
- Moderation/empty output → connector exits non-zero, that frame is skipped; rerun `gen_grok.py --frames <idx>` then `reprocess.py`.
- Action text must NEVER name furniture ("desk", "keyboard") — Grok draws it. Describe the body pose only; the office already has desks. Native res is 256×512 (`config/sprite.json`).

## Feedback log

Append to `feedback/sprite-gen-YYYY-MM.md` after each session: backend, what worked, what drifted, action taken.
