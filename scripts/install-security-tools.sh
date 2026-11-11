#!/bin/bash
# Installs the security tooling this repo expects. Read-only modes first:
#   --check    report what is present and what is missing
#   --list     print the manifest
#   --dry-run  print the commands without running them
#   --install  run the commands for missing tools
set -euo pipefail

MIN_GB="${INSTALL_MIN_GB:-5}"
MODE="${1:---check}"

# name|formula|binary|required|purpose
TOOLS=(
  "clamav|clamav|clamscan|yes|antivirus and upload scanning"
  "semgrep|semgrep|semgrep|yes|static analysis"
  "gitleaks|gitleaks|gitleaks|yes|secret scanning"
  "trivy|trivy|trivy|yes|filesystem and dependency scanning"
  "osv-scanner|osv-scanner|osv-scanner|yes|dependency advisories"
  "lynis|lynis|lynis|yes|host audit"
  "caddy|caddy|caddy|yes|tls ingress"
  "syft|syft|syft|yes|software bill of materials"
  "yq|yq|yq|yes|yaml checks in scripts"
  "suricata|suricata|suricata|yes|network ids"
  "osquery|osquery|osqueryi|no|host telemetry"
  "vector|vectordotdev/brew/vector|vector|no|log pipeline"
  "age|age|age|no|optional backup encryption"
)

free_gb() {
  # -P and -k are portable. df -g is BSD only, so the check broke on Linux.
  df -Pk . | awk 'NR==2 {print int($4 / 1024 / 1024)}'
}

version_of() {
  local bin="$1"
  "$bin" --version 2>/dev/null | head -1 || true
}

print_manifest() {
  printf '%-12s %-28s %-8s %s\n' "NAME" "FORMULA" "REQUIRED" "PURPOSE"
  for row in "${TOOLS[@]}"; do
    IFS='|' read -r name formula bin required purpose <<<"$row"
    printf '%-12s %-28s %-8s %s\n' "$name" "$formula" "$required" "$purpose"
  done
}

check_disk() {
  local gb
  gb="$(free_gb)"
  if [ "$gb" -lt "$MIN_GB" ]; then
    echo "refusing: ${gb} GiB free, need ${MIN_GB} GiB. Free space first." >&2
    exit 1
  fi
}

install_hint() {
  local name="$1" formula="$2"
  if [ "$name" = "vector" ]; then
    echo "brew tap vectordotdev/brew && brew install vector"
  elif [ "$name" = "osquery" ]; then
    echo "brew install osquery || brew install --cask osquery"
  else
    echo "brew install $formula"
  fi
}

case "$MODE" in
  --list)
    print_manifest
    ;;
  --check)
    check_disk
    missing=0
    required_missing=0
    for row in "${TOOLS[@]}"; do
      IFS='|' read -r name formula bin required purpose <<<"$row"
      if command -v "$bin" >/dev/null 2>&1; then
        printf 'present  %-12s %s\n' "$name" "$(version_of "$bin")"
      else
        printf 'missing  %-12s (%s)\n' "$name" "$required"
        missing=$((missing + 1))
        [ "$required" = "yes" ] && required_missing=$((required_missing + 1))
      fi
    done
    echo "missing: $missing, required missing: $required_missing"
    [ "$required_missing" -eq 0 ]
    ;;
  --dry-run)
    check_disk
    for row in "${TOOLS[@]}"; do
      IFS='|' read -r name formula bin required purpose <<<"$row"
      if ! command -v "$bin" >/dev/null 2>&1; then
        install_hint "$name" "$formula"
      fi
    done
    ;;
  --install)
    check_disk
    failed=0
    for row in "${TOOLS[@]}"; do
      IFS='|' read -r name formula bin required purpose <<<"$row"
      if command -v "$bin" >/dev/null 2>&1; then
        printf 'present  %-12s %s\n' "$name" "$(version_of "$bin")"
        continue
      fi
      echo "installing $name"
      if [ "$name" = "vector" ]; then
        brew tap vectordotdev/brew >/dev/null 2>&1 || true
        brew install vector || failed=$((failed + 1))
      elif [ "$name" = "osquery" ]; then
        brew install osquery || brew install --cask osquery || failed=$((failed + 1))
      else
        brew install "$formula" || failed=$((failed + 1))
      fi
      if command -v "$bin" >/dev/null 2>&1; then
        printf 'installed %-12s %s\n' "$name" "$(version_of "$bin")"
      elif [ "$required" = "yes" ]; then
        echo "still missing required $name" >&2
        failed=$((failed + 1))
      fi
    done
    [ "$failed" -eq 0 ]
    ;;
  *)
    echo "usage: $0 [--check|--list|--dry-run|--install]" >&2
    exit 2
    ;;
esac
