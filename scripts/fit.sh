#!/bin/zsh
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for sz in "$@"; do
  W=${sz%x*}; H=${sz#*x}
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files --window-size=900,900 --virtual-time-budget=120000 \
    --dump-dom "file://${ROOT}/scripts/fit-check.html?w=${W}&h=${H}&n=30&s=7" 2>/dev/null \
    | python3 -c "import sys,re; t=sys.stdin.read(); m=re.search(r'<pre id=\"out\"[^>]*>(.*?)</pre>', t, re.S); print((m.group(1) if m else 'NO RESULT').replace('&amp;','&'))"
done
