#!/bin/bash
# Renders dev/icon.html to source/icon.png (1024 px) and source/icon.icns, using Google Chrome (headless) and the
# sips and iconutil tools built into macOS. Run it after changing the icon, then run the installer again.
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "This needs Google Chrome in /Applications."; exit 1; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$TMP/profile" --allow-file-access-from-files \
  --default-background-color=00000000 --force-device-scale-factor=1 --window-size=1024,1024 --virtual-time-budget=3000 \
  --screenshot="$TMP/icon.png" "file://$PWD/dev/icon.html" >/dev/null 2>&1
mkdir "$TMP/icon.iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s "$TMP/icon.png" --out "$TMP/icon.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) "$TMP/icon.png" --out "$TMP/icon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$TMP/icon.iconset" -o source/icon.icns
cp "$TMP/icon.png" source/icon.png
echo "Made source/icon.png and source/icon.icns."
