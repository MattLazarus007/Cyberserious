#!/bin/bash
# File backend for the keychain wrapper. Tests set KEYCHAIN_FILE_DIR, so the
# same contract runs on a Linux runner without the macOS keychain.
#   get <name>      print the value
#   set <name>      read a value from stdin and store it
#   generate <name> create a 32 byte hex value and store it
#   exists <name>   exit 0 when the item is present
#   delete <name>   remove the item
set -euo pipefail

SERVICE="${KEYCHAIN_SERVICE:-cyberserious}"
NAME="${2:-}"
DIR="${KEYCHAIN_FILE_DIR:?set KEYCHAIN_FILE_DIR}"

[ -n "$NAME" ] || {
  echo "usage: $0 get|set|generate|exists|delete <name>" >&2
  exit 2
}
ITEM="$DIR/$SERVICE.$NAME"

case "$1" in
  get)
    cat "$ITEM"
    ;;
  set)
    value="$(cat)"
    [ -n "$value" ] || { echo "refusing an empty secret" >&2; exit 1; }
    mkdir -p "$DIR"
    umask 077
    printf '%s' "$value" > "$ITEM"
    ;;
  generate)
    value="$(openssl rand -hex 32)"
    mkdir -p "$DIR"
    umask 077
    printf '%s' "$value" > "$ITEM"
    ;;
  exists)
    [ -f "$ITEM" ]
    ;;
  delete)
    rm -f "$ITEM"
    ;;
  *)
    echo "usage: $0 get|set|generate|exists|delete <name>" >&2
    exit 2
    ;;
esac
