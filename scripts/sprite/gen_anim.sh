#!/usr/bin/env bash
# Generate one animation row (7 frames) for an office character.
# Usage: scripts/sprite/gen_anim.sh <character> <direction> [start_batch] [end_batch]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/scripts/sprite"

CHAR="${1:?character}"
DIR="${2:?direction}"
START_BATCH="${3:-0}"
END_BATCH="${4:-3}"

PER="$(python3 spritecfg.py framesPerGen)"
LOG="$ROOT/tmp/sprites/$CHAR/$DIR.gen.log"
mkdir -p "$(dirname "$LOG")"

echo "=== gen_anim $CHAR $DIR batches $START_BATCH..$END_BATCH ===" | tee "$LOG"

# Map direction to frame index offset
case "$DIR" in
  down) OFFSET=0 ;;
  up) OFFSET=7 ;;
  right) OFFSET=14 ;;
  *) echo "unknown direction: $DIR"; exit 1 ;;
esac

for b in $(seq "$START_BATCH" "$END_BATCH"); do
  START=$((OFFSET + b * PER))
  echo "--- batch $b start=$START ---" | tee -a "$LOG"
  python3 gen_batch.py prepare --character "$CHAR" --start "$START" 2>&1 | tee -a "$LOG"
  BID=$((START / PER))
  RAW="$ROOT/tmp/sprites/$CHAR/batch-$(printf '%02d' "$BID")-raw.png"
  if [[ ! -f "$RAW" ]]; then
    echo "WAIT: save GenerateImage output to $RAW then re-run:" | tee -a "$LOG"
    echo "  python3 gen_batch.py process --character $CHAR --start $START" | tee -a "$LOG"
    exit 2
  fi
  python3 gen_batch.py process --character "$CHAR" --start "$START" 2>&1 | tee -a "$LOG"
done

python3 assemble_sheet.py --character "$CHAR" --frames-dir "$ROOT/tmp/sprites/$CHAR/frames"
OUT="$(python3 spritecfg.py characters.$CHAR.sheetOut)"
python3 quantize_palette.py --character "$CHAR" --in "$ROOT/$OUT" --out "$ROOT/$OUT"
python3 strip_chroma.py --in "$ROOT/$OUT" --out "$ROOT/$OUT" --pass 2
python3 audit_sprite.py --frames-dir "$ROOT/tmp/sprites/$CHAR/frames"
echo "done -> $OUT" | tee -a "$LOG"