#!/bin/bash
# Double-click this file to build Day by Day and put it in your Applications folder.
# Run it again any time the source changes. Your entries are never touched by this.
# Uses only tools built into macOS (curl, ditto, PlistBuddy, codesign). No Node needed.
ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG="$ROOT/install-log.txt"
: > "$LOG"
exec > >(tee -a "$LOG") 2>&1

fail() {
  echo ""
  echo "  ✗ Install stopped: $1"
  echo "  The full log is in install-log.txt in the DayByDay folder."
  echo "  Tell Claude it failed and it can read that log."
  echo ""
  exit 1
}

EV="33.4.11"
ARCH="$(uname -m)"; [ "$ARCH" = "x86_64" ] && EARCH="x64" || EARCH="arm64"
SRC="$ROOT/source"
# The version lives only in source/package.json (plutil reads JSON too).
VER="$(plutil -extract version raw -o - "$SRC/package.json")" || fail "couldn't read the version from source/package.json"
# One Electron download shared by every app in the family (Day by Day, Point by Point, …)
CACHE="$HOME/Library/Caches/Theo Apps/Electron"
ZIPNAME="electron-v$EV-darwin-$EARCH.zip"
ZIP="$CACHE/$ZIPNAME"
WORK="$(mktemp -d)"
PB=/usr/libexec/PlistBuddy

echo ""
echo "  Day by Day — building the app"
echo "  ------------------------------"
echo "  $(date)  ·  macOS $(sw_vers -productVersion)  ·  $ARCH"

mkdir -p "$CACHE"
# Reuse a copy an older installer already downloaded, if there is one.
if [ ! -s "$ZIP" ]; then
  for OLD in "$HOME/Library/Caches/Day by Day/$ZIPNAME" "$HOME/Library/Caches/Point by Point/$ZIPNAME"; do
    if [ -s "$OLD" ]; then echo "  Reusing the Electron download from $(basename "$(dirname "$OLD")")…"; mv "$OLD" "$ZIP"; break; fi
  done
fi
if [ ! -s "$ZIP" ]; then
  echo "  Downloading Electron $EV (about 100 MB, first time only)…"
  curl -fL# -o "$ZIP.part" "https://github.com/electron/electron/releases/download/v$EV/electron-v$EV-darwin-$EARCH.zip" \
    || fail "couldn't download Electron"
  mv "$ZIP.part" "$ZIP"
fi

echo "  Unpacking…"
ditto -x -k "$ZIP" "$WORK" || { rm -f "$ZIP"; fail "the Electron download was damaged; run the installer again"; }
[ -d "$WORK/Electron.app" ] || fail "Electron.app wasn't in the download"

APP="$WORK/Day by Day.app"
mv "$WORK/Electron.app" "$APP"
RES="$APP/Contents/Resources"

echo "  Adding the Day by Day files…"
rm -f "$RES/default_app.asar"
mkdir -p "$RES/app"
cp "$SRC/package.json" "$SRC/main.js" "$SRC/preload.js" "$SRC/share.js" "$SRC/share-config.json" "$SRC/index.html" "$SRC/tray.html" "$SRC/trayTemplate.png" "$SRC/trayTemplate@2x.png" "$RES/app/" || fail "couldn't copy the app files"
cp -R "$SRC/fonts" "$RES/app/" || fail "couldn't copy the fonts"
cp "$SRC/icon.icns" "$RES/electron.icns" || fail "couldn't copy the icon"

PL="$APP/Contents/Info.plist"
$PB -c "Set :CFBundleName Day by Day" "$PL"
$PB -c "Set :CFBundleDisplayName Day by Day" "$PL" 2>/dev/null || $PB -c "Add :CFBundleDisplayName string Day by Day" "$PL"
$PB -c "Set :CFBundleIdentifier com.theo.daybyday" "$PL"
$PB -c "Set :CFBundleShortVersionString $VER" "$PL"
$PB -c "Set :CFBundleVersion $VER" "$PL"
$PB -c "Set :NSHumanReadableCopyright © $(date +%Y) Theo" "$PL" 2>/dev/null || $PB -c "Add :NSHumanReadableCopyright string © $(date +%Y) Theo" "$PL"

echo "  Signing (local, ad-hoc)…"
xattr -cr "$APP" 2>/dev/null
codesign --force --deep --sign - "$APP" || fail "code signing failed"

DEST="/Applications"
[ -w "$DEST" ] || DEST="$HOME/Applications"
mkdir -p "$DEST"
osascript -e 'quit app "Day by Day"' >/dev/null 2>&1 || true
sleep 1
rm -rf "$DEST/Day by Day.app"
ditto "$APP" "$DEST/Day by Day.app" || fail "couldn't copy the app into $DEST"
rm -rf "$WORK"
# refresh the Dock/Finder icon cache for this app
touch "$DEST/Day by Day.app"

echo ""
echo "  ✓ Done. Day by Day is in $DEST."
echo "  Tip: right-click its Dock icon → Options → Keep in Dock."
echo ""
open "$DEST/Day by Day.app" || fail "the app was installed but wouldn't open"
