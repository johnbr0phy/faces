#!/bin/zsh
# Render a few seeded dudes into progress/shots/
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/progress/shots"
mkdir -p "$OUT"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SEEDS=(${@:-1107 777 4929 42 2026 88 333 1500})
i=1
for s in $SEEDS; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --window-size=720,980 --virtual-time-budget=3500 \
    --screenshot="$OUT/s${s}.png" \
    "file://${ROOT}/index.html?s=${s}" >/dev/null 2>&1 || true
  echo "shot seed $s -> $OUT/s${s}.png"
  i=$((i+1))
done
