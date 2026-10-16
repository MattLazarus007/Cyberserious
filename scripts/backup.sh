#!/bin/bash
# Nightly backup: database dumps plus the evidence directory, with checksums.
# Restores are rehearsed under docs/runbooks/restore.md.
set -euo pipefail

OUT="${1:-data/backups/$(date -u +%Y-%m-%d)}"
mkdir -p "$OUT"

pg_dump "$DATABASE_URL" --format=custom --file="$OUT/regulator.dump"
pg_dump "$ORG_DATABASE_URL" --format=custom --file="$OUT/organisation.dump"

if [ -d data/evidence ]; then
  tar -czf "$OUT/evidence.tar.gz" -C data evidence
else
  echo "no evidence directory yet, skipping" > "$OUT/evidence-note.txt"
fi

(cd "$OUT" && ls | grep -v '^SHA256SUMS$' | xargs shasum -a 256 > SHA256SUMS)

echo "backup written to $OUT"
cat "$OUT/SHA256SUMS"
