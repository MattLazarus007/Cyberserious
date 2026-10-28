#!/bin/bash
# Supply chain and static checks. Runs read-only, prints a summary, exits
# non-zero if any tool finds something that matters.
#   --check-tools  report which scanners are present
#   all            gitleaks, osv-scanner, trivy, semgrep
#   secrets|deps|fs|sast  run one scanner
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

usage() {
  echo "usage: $0 --check-tools|all|secrets|deps|fs|sast" >&2
  exit 2
}

tools=(gitleaks osv-scanner trivy semgrep)
check_tools() {
  local missing=0
  for t in "${tools[@]}"; do
    if command -v "$t" >/dev/null 2>&1; then
      echo "present: $t"
    else
      echo "missing: $t"
      missing=1
    fi
  done
  return "$missing"
}

run_secrets() {
  echo "== gitleaks (git history) =="
  gitleaks git --no-banner --redact --exit-code 1
}

run_deps() {
  echo "== osv-scanner (package-lock.json) =="
  osv-scanner --lockfile=package-lock.json | sed "s|$PWD/||g"
}

run_fs() {
  echo "== trivy (vulnerability, secret, misconfig) =="
  trivy fs --quiet --scanners vuln,secret,misconfig --severity HIGH,CRITICAL \
    --exit-code 1 --skip-dirs node_modules --skip-dirs .git --skip-dirs data \
    --skip-dirs certs .
}

run_sast() {
  echo "== semgrep (ERROR severity) =="
  semgrep scan --config p/typescript --config p/nodejs --severity ERROR --error --quiet apps scripts
}

status=0
case "${1:-}" in
  --check-tools)
    check_tools || status=1
    ;;
  secrets) run_secrets || status=1 ;;
  deps) run_deps || status=1 ;;
  fs) run_fs || status=1 ;;
  sast) run_sast || status=1 ;;
  all)
    check_tools || { echo "install the missing tools before a full run" >&2; exit 1; }
    run_secrets || status=1
    run_deps || status=1
    run_fs || status=1
    run_sast || status=1
    ;;
  *) usage ;;
esac

if [ "$status" -eq 0 ]; then
  echo "security scan: clean"
else
  echo "security scan: findings above" >&2
fi
exit "$status"
