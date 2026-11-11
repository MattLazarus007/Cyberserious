#!/bin/bash
# Encrypted APFS volume for evidence and backups.
#   create   make the sparse bundle once and store its passphrase in the keychain
#   mount    attach it at data/vault and create the expected directories
#   unmount  detach it
#   status   show whether it is mounted and encrypted
set -euo pipefail

BUNDLE="${VAULT_BUNDLE:-data/CyberVault.sparsebundle}"
MOUNT="${VAULT_MOUNT:-data/vault}"
SIZE="${VAULT_SIZE:-8g}"
NAME="${VAULT_NAME:-CyberVault}"
KEY_NAME="vault"

passphrase() {
  bash scripts/keychain.sh get "$KEY_NAME"
}

mounted() {
  local abs
  abs="$(cd "$(dirname "$MOUNT")" 2>/dev/null && pwd)/$(basename "$MOUNT")"
  [ -n "$abs" ] && mount | grep -F "on $abs " >/dev/null 2>&1
}

case "${1:-status}" in
  create)
    if [ -e "$BUNDLE" ]; then
      echo "already exists: $BUNDLE" >&2
      exit 1
    fi
    if bash scripts/keychain.sh exists "$KEY_NAME"; then
      echo "keychain already holds $KEY_NAME, refusing to overwrite" >&2
      exit 1
    fi
    bash scripts/keychain.sh generate "$KEY_NAME"
    mkdir -p "$(dirname "$BUNDLE")"
    passphrase | tr -d '\n' | hdiutil create -quiet -encryption AES-256 -stdinpass \
      -type SPARSEBUNDLE -fs APFS -size "$SIZE" -volname "$NAME" "$BUNDLE"
    echo "created $BUNDLE"
    ;;
  mount)
    if mounted; then
      echo "already mounted at $MOUNT"
      exit 0
    fi
    [ -e "$BUNDLE" ] || { echo "no vault at $BUNDLE, run create first" >&2; exit 1; }
    mkdir -p "$MOUNT"
    passphrase | tr -d '\n' | hdiutil attach -stdinpass -nobrowse -mountpoint "$MOUNT" "$BUNDLE" >/dev/null
    mkdir -p "$MOUNT/evidence" "$MOUNT/backups"
    chmod 700 "$MOUNT" "$MOUNT/evidence" "$MOUNT/backups"
    echo "mounted at $MOUNT"
    ;;
  unmount)
    if mounted; then
      hdiutil detach "$MOUNT" >/dev/null
      echo "unmounted $MOUNT"
    else
      echo "not mounted"
    fi
    ;;
  status)
    if mounted; then
      echo "mounted: $MOUNT"
      hdiutil info | awk -v b="$BUNDLE" '$0 ~ b {seen=1} seen && /image-encrypted/ {print; exit}'
      diskutil info "$MOUNT" | grep -Ei "mount point" || true
    else
      echo "not mounted"
      exit 1
    fi
    ;;
  *)
    echo "usage: $0 create|mount|unmount|status" >&2
    exit 2
    ;;
esac
