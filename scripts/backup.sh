#!/bin/bash
# Nightly backup: database dumps and evidence, bundled, then sealed with age.
# The archive is written to the encrypted vault when it is mounted, and to
# data/backups otherwise. No plaintext bundle is left behind.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

: "${DATABASE_URL:?source scripts/env.sh first}"
ORG_URL="${ORG_DATABASE_URL:-postgres://cyberserious:***@localhost:5432/cyberserious_org_dev}"
EVIDENCE="${EVIDENCE_DIR:-$ROOT/data/evidence}"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"

if [ "${1:-}" = "--dry-run" ]; then
  [ -f "$ROOT/data/backup.pub" ] || { echo "dry-run: no recipient key" >&2; exit 1; }
  command -v pg_dump >/dev/null || { echo "dry-run: pg_dump missing" >&2; exit 1; }
  command -v age >/dev/null || { echo "dry-run: age missing" >&2; exit 1; }
  bash scripts/keychain.sh exists backup-key >/dev/null 2>&1 || { echo "dry-run: backup identity missing from keychain" >&2; exit 1; }
  pg_dump "$DATABASE_URL" --schema-only --file=/dev/null
  echo "dry-run: recipient, tools, identity and database reachable"
  exit 0
fi

if mount | grep -q " on $ROOT/data/vault "; then
  OUT="${BACKUP_OUT:-$ROOT/data/vault/backups}"
else
  OUT="${BACKUP_OUT:-$ROOT/data/backups}"
  echo "vault is not mounted, writing the sealed archive to $OUT"
fi
mkdir -p "$OUT"

if [ ! -f "$ROOT/data/backup.pub" ]; then
  echo "no recipient; run bash scripts/seal.sh init once" >&2
  exit 1
fi

work="$(mktemp -d -t cyberserious-backup.XXXXXX)"
trap 'rm -rf "$work"' EXIT

pg_dump "$DATABASE_URL" --format=custom --file="$work/regulator.dump"
pg_dump "$ORG_URL" --format=custom --file="$work/organisation.dump"

parts=(regulator.dump organisation.dump)
if [ -d "$EVIDENCE" ]; then
  tar -czf "$work/evidence.tar.gz" -C "$(dirname "$EVIDENCE")" "$(basename "$EVIDENCE")"
  parts+=(evidence.tar.gz)
else
  echo "no evidence directory at $EVIDENCE, skipping" >&2
fi

tar -czf "$work/bundle.tar.gz" -C "$work" "${parts[@]}"

sealed="$OUT/cyberserious-$STAMP.tar.gz.age"
bash scripts/seal.sh seal "$work/bundle.tar.gz" "$sealed"
shasum -a 256 "$sealed" > "$sealed.sha256"

echo "sealed backup written to $sealed"
cat "$sealed.sha256"
