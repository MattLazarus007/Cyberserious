#!/bin/bash
# Report the patch level of the host packages and the pending system updates.
# The application tree has its own gate: bash scripts/security-scan.sh deps
set -uo pipefail

json="$(mktemp -t outdated.XXXXXX)"
brew outdated --json=v2 > "$json" 2>/dev/null || true

printf 'formulae behind        %s\n' "$(jq -r '.formulae|length' "$json")"
printf 'casks behind           %s\n' "$(jq -r '.casks|length' "$json")"
printf 'system updates pending %s\n' "$(softwareupdate --list 2>/dev/null | grep -c 'Label:')"

printf '\nsecurity relevant packages\n'
jq -r '.formulae[]
  | select(.name=="node" or .name=="postgresql@16" or .name=="docker"
           or .name=="gh" or .name=="python@3.11")
  | "  \(.name)  \(.installed_versions|join(",")) -> \(.current_version)"' "$json"

rm -f "$json"
