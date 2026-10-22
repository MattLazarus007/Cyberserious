#!/bin/bash
# One command that proves the lab security stack from the inside.
# No sudo, no external network, localhost only.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck disable=SC1091
source scripts/env.sh >/dev/null 2>&1 || true

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set after scripts/env.sh" >&2
  exit 1
fi

passed=0
failed=0
started="$(date +%s)"
results=()

run_gate() {
  local name="$1"
  shift
  printf '%-24s ' "$name"
  local log
  log="$(mktemp -t cyberserious-verify.XXXXXX)"
  if "$@" >"$log" 2>&1; then
    echo "PASS"
    results+=("PASS  $name")
    passed=$((passed + 1))
  else
    echo "FAIL"
    results+=("FAIL  $name")
    failed=$((failed + 1))
    tail -20 "$log" | sed 's/^/      /'
  fi
  rm -f "$log"
}

run_gate "tool manifest" bash scripts/install-security-tools.sh --check
run_gate "secrets" bash scripts/security-scan.sh secrets
run_gate "dependencies" bash scripts/security-scan.sh deps
run_gate "static analysis" bash scripts/security-scan.sh sast
run_gate "test suite" npm test
run_gate "browser suite" npm run test:e2e
run_gate "audit chains" node scripts/verify-chain.mjs
run_gate "backup dry run" bash scripts/backup.sh --dry-run

printf '%-24s ' "posture summary"
if bash scripts/posture.sh >/tmp/cyberserious-posture.txt 2>&1; then
  echo "INFO"
  results+=("INFO  posture summary (/tmp/cyberserious-posture.txt)")
else
  echo "INFO"
  results+=("INFO  posture summary (/tmp/cyberserious-posture.txt)")
fi

elapsed=$(( $(date +%s) - started ))
echo
echo "Gates: $passed passed, $failed failed, ${elapsed}s"
echo "HEAD: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
for line in "${results[@]}"; do echo "  $line"; done
[ "$failed" -eq 0 ]
