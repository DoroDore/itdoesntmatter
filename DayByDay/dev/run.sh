#!/bin/bash
# Runs Day by Day straight from source/, the way a user sees it, without installing it.
# It keeps its own practice data in ~/Library/Application Support/Day by Day (dev), so your real
# entries are never touched, and it doesn't add itself to Login Items.
#
# In VS Code: ⇧⌘B runs it (the "Run Day by Day" task), and F5 runs it with the debugger on main.js.
# In the app, ⌥⌘I opens DevTools for the page. Quit with ⌘Q; edit, then run again to see changes.
#
#   dev/run.sh            open the app
#   dev/run.sh --prepare  only make sure Electron is downloaded and unpacked (what F5 runs first)
#   dev/run.sh --fresh    open it with empty practice data, like a brand-new user
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EV="$(plutil -extract devDependencies.electron raw -o - "$ROOT/source/package.json")"
[ "$(uname -m)" = "x86_64" ] && EARCH="x64" || EARCH="arm64"
CACHE="$HOME/Library/Caches/Theo Apps/Electron"   # shared with the installer, so it's downloaded once
ZIP="$CACHE/electron-v$EV-darwin-$EARCH.zip"
UNPACKED="$CACHE/dev"

if [ "$(cat "$UNPACKED/version" 2>/dev/null)" != "$EV" ] || [ ! -x "$UNPACKED/Electron.app/Contents/MacOS/Electron" ]; then
  mkdir -p "$CACHE"
  if [ ! -s "$ZIP" ]; then
    echo "Downloading Electron $EV (about 100 MB, first time only)…"
    curl -fL# -o "$ZIP.part" "https://github.com/electron/electron/releases/download/v$EV/electron-v$EV-darwin-$EARCH.zip"
    mv "$ZIP.part" "$ZIP"
  fi
  echo "Unpacking Electron…"
  rm -rf "$UNPACKED"; mkdir -p "$UNPACKED"
  ditto -x -k "$ZIP" "$UNPACKED" || { rm -f "$ZIP"; echo "The Electron download was damaged. Run this again."; exit 1; }
fi

case "${1:-}" in
  --prepare) exit 0 ;;
  --fresh) rm -rf "$HOME/Library/Application Support/Day by Day (dev)" ;;
esac
export DAYBYDAY_DEV=1
exec "$UNPACKED/Electron.app/Contents/MacOS/Electron" "$ROOT/source"
