#!/bin/bash
# age sealing for backups. The identity lives in the keychain, never on disk.
#   init            create an identity and publish its public key
#   seal <in> <out> encrypt a file to the stored recipient
#   unseal <in> <out> decrypt with the stored identity
#   pub             print the recipient
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUB="${BACKUP_PUB:-$ROOT/data/backup.pub}"
SERVICE="${KEYCHAIN_SERVICE:-cyberserious}"

usage() {
  echo "usage: $0 init|seal <in> <out>|unseal <in> <out>|pub" >&2
  exit 2
}

identity_tmp() {
  local tmp
  tmp="$(mktemp -t cyberserious-age.XXXXXX)"
  chmod 600 "$tmp"
  KEYCHAIN_SERVICE="$SERVICE" bash "$ROOT/scripts/keychain.sh" get backup-key | openssl base64 -d -A > "$tmp"
  echo "$tmp"
}

case "${1:-}" in
  init)
    if KEYCHAIN_SERVICE="$SERVICE" bash "$ROOT/scripts/keychain.sh" exists backup-key; then
      echo "identity already exists" >&2
      exit 1
    fi
    tmp="$(mktemp -t cyberserious-key.XXXXXX)"
    trap 'rm -f "$tmp"' EXIT
    rm -f "$tmp"
    age-keygen -o "$tmp" 2>/dev/null
    openssl base64 -A -in "$tmp" | KEYCHAIN_SERVICE="$SERVICE" bash "$ROOT/scripts/keychain.sh" set backup-key
    grep '^# public key:' "$tmp" | awk '{print $4}' > "$PUB"
    chmod 644 "$PUB"
    echo "identity stored in the keychain, recipient written to $PUB"
    ;;
  pub)
    cat "$PUB"
    ;;
  seal)
    [ -n "${2:-}" ] && [ -n "${3:-}" ] || usage
    [ -f "$PUB" ] || { echo "run init first" >&2; exit 1; }
    idfile="$(identity_tmp)"
    trap 'rm -f "$idfile"' EXIT
    age -e -r "$(cat "$PUB")" -o "$3" "$2"
    echo "sealed $3"
    ;;
  unseal)
    [ -n "${2:-}" ] && [ -n "${3:-}" ] || usage
    idfile="$(identity_tmp)"
    trap 'rm -f "$idfile"' EXIT
    age -d -i "$idfile" -o "$3" "$2"
    echo "unsealed $3"
    ;;
  *)
    usage
    ;;
esac
