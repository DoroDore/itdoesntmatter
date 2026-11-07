#!/bin/bash
# Tests setup.sql's privacy rules in a throwaway local Postgres. No Supabase account needed.
# stub.sql stands in for the parts of Supabase that setup.sql relies on (auth.uid(), storage.objects).
# Needs Postgres 15 or newer: `brew install postgresql@16`, or set PG_BIN to the folder with initdb and postgres.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="${PG_BIN:-}"
if [ -z "$BIN" ]; then
  for c in "$(dirname "$(command -v postgres 2>/dev/null || echo /nonexistent/x)")" /opt/homebrew/opt/postgresql@16/bin /opt/homebrew/opt/postgresql@17/bin /usr/local/opt/postgresql@16/bin; do
    [ -x "$c/postgres" ] && BIN="$c" && break
  done
fi
[ -x "$BIN/postgres" ] || { echo "Couldn't find Postgres. Install it with: brew install postgresql@16"; exit 2; }
DATA="$(mktemp -d)"; trap 'rm -rf "$DATA"' EXIT
"$BIN/initdb" -D "$DATA" -U postgres --no-locale -E UTF8 --auth=trust >/dev/null || exit 2
# setup.sql runs twice to prove it's safe to re-run. In single-user mode (-j) a statement ends at ";" plus a blank line.
OUT="$(cat "$HERE/stub.sql" <(echo) "$HERE/../setup.sql" <(echo) "$HERE/../setup.sql" <(echo) "$HERE/policies.sql" \
  | "$BIN/postgres" --single -j -D "$DATA" postgres 2>&1)"
echo "$OUT" | grep -E "PASS|FAIL|ERROR" | sed -E 's/^.*(PASS|FAIL|ERROR)/\1/'
P=$(echo "$OUT" | grep -c "PASS"); F=$(echo "$OUT" | grep -cE "FAIL|ERROR")
echo ""; echo "$P passed, $F failed"
[ "$F" -eq 0 ]
