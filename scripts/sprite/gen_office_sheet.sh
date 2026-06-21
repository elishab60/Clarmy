#!/usr/bin/env bash
# Assemble + quantize final office sheet from generated frames.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CHAR="${1:-anni}"
cd "$ROOT/scripts/sprite"
FRAMES="$ROOT/tmp/sprites/$CHAR/frames"
python3 assemble_sheet.py --character "$CHAR" --frames-dir "$FRAMES"
OUT="$ROOT/$(python3 spritecfg.py characters.$CHAR.sheetOut)"
python3 quantize_palette.py --character "$CHAR" --in "$OUT" --out "$OUT"
python3 strip_chroma.py --in "$OUT" --out "$OUT" --pass 2
python3 audit_sprite.py --frames-dir "$FRAMES"
echo "office sheet -> $OUT"