#!/bin/bash
# Runs Day by Day's tests with tools built into macOS.
#   1. share.js (Friends client) against a fake Supabase, in JavaScriptCore
#   2. every JavaScript file parses (including the scripts inside index.html and tray.html)
#   3. supabase/setup.sql's privacy rules, if Postgres is installed (brew install postgresql@16)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
FAILED=0

echo "== share.js =="
OUT="$("$JSC" "$ROOT/dev/share-test.js" -- "$ROOT/source/share.js")"
echo "$OUT" | grep -vE "^PASS" ; echo "$OUT" | grep -qE "^(FAIL|CRASH)" && FAILED=1

echo ""; echo "== everything parses =="
for f in main.js share.js preload.js index.html tray.html; do
  src="$ROOT/source/$f"
  case "$f" in *.html) /usr/bin/python3 -I -c 'import re,sys; print("\n".join(re.findall(r"<script>(.*?)</script>", open(sys.argv[1]).read(), re.S)))' "$src" > "$TMP/$f.js"; src="$TMP/$f.js" ;; esac
  printf 'try { new Function("require","module","exports","__dirname", read(%s)); print("ok   %s"); } catch (e) { print("FAIL %s: " + e); }' "\"$src\"" "$f" "$f" > "$TMP/parse.js"
  R="$("$JSC" "$TMP/parse.js")"; echo "$R"; [[ "$R" == FAIL* ]] && FAILED=1
done

echo ""; echo "== supabase/setup.sql privacy rules =="
"$ROOT/supabase/test/run.sh"; RC=$?
[ $RC -eq 1 ] && FAILED=1
[ $RC -eq 2 ] && echo "(skipped)"

echo ""; [ $FAILED -eq 0 ] && echo "All tests passed." || echo "Some tests failed."
exit $FAILED
