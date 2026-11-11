#!/bin/bash
# Small wrapper around the login keychain. Keys never enter the repo or .env.
#   get <name>      print the value
#   set <name>      read a value from stdin and store it
#   generate <name> create a 32 byte hex value and store it
#   exists <name>   exit 0 when the item is present
#   delete <name>   remove the item
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# A test sets KEYCHAIN_FILE_DIR to exercise the same contract on a runner
# without the macOS keychain.
if [ -n "${KEYCHAIN_FILE_DIR:-}" ]; then
  exec bash "$ROOT/scripts/keychain-file.sh" "$@"
fi

SERVICE="${KEYCHAIN_SERVICE:-cyberserious}"
NAME="${2:-}"

usage() {
  echo "usage: $0 get|set|generate|exists|delete <name>" >&2
  exit 2
}

[ -n "$NAME" ] || usage
ITEM="$SERVICE.$NAME"

case "$1" in
  get)
    security find-generic-password -s "$ITEM" -w
    ;;
  set)
    value="$(cat)"
    [ -n "$value" ] || { echo "refusing an empty secret" >&2; exit 1; }
    security add-generic-password -U -a "$USER" -s "$ITEM" -w "$value"
    ;;
  generate)
    value="$(openssl rand -hex 32)"
    security add-generic-password -U -a "$USER" -s "$ITEM" -w "$value"
    ;;
  exists)
    security find-generic-password -s "$ITEM" >/dev/null 2>&1
    ;;
  delete)
    security delete-generic-password -s "$ITEM" >/dev/null
    ;;
  *)
    usage
    ;;
esac
