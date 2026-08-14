#!/bin/zsh
# Frames evenly around one motion cycle, to flip through by hand
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/progress/shots/anim"
mkdir -p "$OUT"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
S=${1:-777}
M=${2:-wave}
N=${3:-6}
for i in $(seq 0 $((N-1))); do
  PH=$(python3 -c "print($i/$N)")
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --window-size=720,980 --virtual-time-budget=4000 \
    --screenshot="$OUT/${M}-${S}-${i}.png" \
    "file://${ROOT}/index.html?s=${S}&anim=1&m=${M}&ph=${PH}" >/dev/null 2>&1 || true
done
echo "frames -> $OUT/${M}-${S}-*.png"
