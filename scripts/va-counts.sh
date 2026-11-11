#!/bin/bash
# Print the assessment counts straight from the saved artefacts.
# No value is typed by hand. Run the assessment first.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
OUT=docs/security/scans

if [ ! -d "$OUT" ]; then
  echo "no artefacts yet: run bash scripts/vulnerability-assessment.sh" >&2
  exit 1
fi

printf 'gitleaks findings       %s\n' "$(jq 'if type=="array" then length else (.findings|length) end' "$OUT/gitleaks.json")"
printf 'semgrep findings        %s\n' "$(jq '.results | length' "$OUT/semgrep.json")"
printf 'trivy vulnerabilities   %s\n' "$(jq '[.Results[]?.Vulnerabilities[]?] | length' "$OUT/trivy.json")"
printf 'trivy secrets           %s\n' "$(jq '[.Results[]?.Secrets[]?] | length' "$OUT/trivy.json")"
printf 'trivy misconfigurations %s\n' "$(jq '[.Results[]?.Misconfigurations[]?] | length' "$OUT/trivy.json")"
printf 'osv affected packages   %s\n' "$(jq '[.results[]?.packages[]? | select((.vulnerabilities // []) | length > 0)] | length' "$OUT/osv.json")"

printf '\nZAP risk levels\n'
jq -r '[.site[].alerts[] | (.riskdesc|split(" ")[0])] | group_by(.) | map("\(length)  \(.[0])") | .[]' \
  docs/security/dast.json | sort
