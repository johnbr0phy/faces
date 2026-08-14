#!/bin/zsh
# Render a sheet of heads for side-by-side judging against the reference plates
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/progress/shots"
mkdir -p "$OUT"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
S=${1:-2026}
"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --window-size=740,1180 --virtual-time-budget=9000 \
  --screenshot="$OUT/plate-${S}.png" \
  "file://${ROOT}/index.html?plate=1&s=${S}" >/dev/null 2>&1 || true
echo "plate -> $OUT/plate-${S}.png"
