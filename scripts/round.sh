#!/bin/zsh
# Snapshot / render / keep / revert one gauntlet round.
# Usage: scripts/round.sh before|after|keep|revert
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ROUND="$ROOT/progress/round"
BEFORE="$ROUND/before"
AFTER="$ROUND/after"
SHOTS="$ROOT/progress/shots"
SEEDS=(42 777 2026 4929)
cmd=${1:-}

stamp() { date "+%Y-%m-%d %H:%M"; }

case "$cmd" in
  before)
    rm -rf "$BEFORE"
    mkdir -p "$BEFORE"
    cp "$ROOT/dude.js" "$BEFORE/dude.js"
    for s in $SEEDS; do
      if [[ -f "$SHOTS/s${s}.png" ]]; then cp "$SHOTS/s${s}.png" "$BEFORE/s${s}.png"; fi
    done
    if [[ -f "$SHOTS/plate-2026.png" ]]; then cp "$SHOTS/plate-2026.png" "$BEFORE/plate-2026.png"; fi
    echo "$(stamp)  before  dude.js + shots frozen" >> "$ROUND/log.md"
    echo "snapshot -> $BEFORE"
    ;;
  after)
    mkdir -p "$AFTER"
    "$ROOT/scripts/shot.sh" $SEEDS
    "$ROOT/scripts/plate.sh" 2026
    for s in $SEEDS; do
      cp "$SHOTS/s${s}.png" "$AFTER/s${s}.png"
    done
    cp "$SHOTS/plate-2026.png" "$AFTER/plate-2026.png"
    echo "$(stamp)  after   rendered $SEEDS + plate-2026" >> "$ROUND/log.md"
    echo "after -> $AFTER"
    ;;
  keep)
    mkdir -p "$ROUND/kept"
    if [[ -f "$AFTER/s42.png" ]]; then
      cp "$AFTER"/s*.png "$SHOTS"/
      cp "$AFTER/plate-2026.png" "$SHOTS/plate-2026.png"
    fi
    echo "$(stamp)  KEEP    $(head -n 1 "$ROUND/gap.md" 2>/dev/null || echo '(no gap.md)')" >> "$ROUND/log.md"
    echo "kept. append a note to progress.html."
    ;;
  revert)
    if [[ ! -f "$BEFORE/dude.js" ]]; then
      echo "no snapshot at $BEFORE/dude.js — cannot revert" >&2
      exit 1
    fi
    cp "$BEFORE/dude.js" "$ROOT/dude.js"
    if [[ -f "$BEFORE/s42.png" ]]; then
      cp "$BEFORE"/s*.png "$SHOTS"/
    fi
    if [[ -f "$BEFORE/plate-2026.png" ]]; then
      cp "$BEFORE/plate-2026.png" "$SHOTS/plate-2026.png"
    fi
    echo "$(stamp)  REVERT  $(head -n 1 "$ROUND/gap.md" 2>/dev/null || echo '(no gap.md)')" >> "$ROUND/log.md"
    echo "reverted dude.js to snapshot"
    ;;
  *)
    echo "usage: $0 before|after|keep|revert" >&2
    exit 2
    ;;
esac
