#!/bin/zsh
# Render the sheet at an exact CSS size and crop it out of the capture.
# Headless Chrome on macOS clamps its window to 500px wide and ignores the
# requested height for layout, so --window-size cannot be trusted to test a
# phone. The harness page pins .sheet to exact pixels instead.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
W=$1; H=$2; SEED=$3; OUT=$4; HIT=${5:-}
WW=$((W+80)); HH=$((H+80))
if [ $WW -lt 560 ]; then WW=560; fi
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=$WW,$HH --virtual-time-budget=20000 --screenshot="/tmp/_vp_raw.png" \
  "file://${ROOT}/scripts/sheet-size.html?w=${W}&h=${H}&s=${SEED}${HIT}" >/dev/null 2>&1
python3 - "$W" "$H" "$OUT" <<'PY'
import sys
from PIL import Image
w,h,out=int(sys.argv[1]),int(sys.argv[2]),sys.argv[3]
im=Image.open("/tmp/_vp_raw.png").convert("RGB")
im.crop((0,0,min(w,im.size[0]),min(h,im.size[1]))).save(out)
print("layout",w,"x",h,"capture",im.size,"->",out)
PY
