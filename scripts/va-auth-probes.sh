#!/bin/bash
# Authenticated probes as analyst1 against the live regulator.
set -uo pipefail
B=http://127.0.0.1:8100
JAR="$(mktemp -t va-jar.XXXXXX)"
LOG=$HOME/cyberserious/data/logs/regulator.launchd.log

before=$(grep -c "code for analyst1" "$LOG" 2>/dev/null)
curl -s -c "$JAR" -o /dev/null -m 5 -X POST "$B/api/v1/login" \
  -H 'content-type: application/json' \
  -d '{"username":"analyst1","password":"demo-analyst-pass"}'
for i in $(seq 1 40); do
  n=$(grep -c "code for analyst1" "$LOG")
  if [ "$n" -gt "$before" ]; then break; fi
  sleep 0.25
done
CODE=$(sed -n 's/.*code for analyst1: \([0-9]\{6\}\).*/\1/p' "$LOG" | tail -1)
echo "code read: ${#CODE} digits"
curl -s -b "$JAR" -c "$JAR" -o /dev/null -m 5 -X POST "$B/api/v1/login/otp" \
  -H 'content-type: application/json' -d "{\"code\":\"$CODE\"}"

p() {
  printf '%-44s %s\n' "$1" \
    "$(curl -s -b "$JAR" -o /dev/null -m 5 -w '%{http_code}' "$2")"
}

echo "# authenticated probes as analyst1"
p "GET /api/v1/cases"                  "$B/api/v1/cases"
p "GET /api/v1/cases/BR-2026-0001"     "$B/api/v1/cases/BR-2026-0001"
p "GET /api/v1/users (needs admin)"    "$B/api/v1/users"
p "GET /api/v1/audit/verify (reviewer only)" "$B/api/v1/audit/verify"
p "GET export for one case"            "$B/api/v1/cases/BR-2026-0001/export"
echo "--- export manifest, counts only"
curl -s -b "$JAR" -m 5 "$B/api/v1/cases/BR-2026-0001/export" \
  | jq -c '{marking, manifest}'
rm -f "$JAR"
