#!/bin/bash
# Trip-wire drill. Drives the regulator past the warning threshold twice and
# records what the service did. Read the output, then reopen the service.
# The drill locks the regulator, so run it after a demo, never before one.
set -uo pipefail

BASE="${BASE:-http://localhost:8100}"
THRESHOLD="${TRIP_THRESHOLD:-5}"
BURST="${BURST:-$((THRESHOLD * 2))}"

echo "target      $BASE"
echo "threshold   $THRESHOLD"
echo

echo "sessions before:"
psql "${DATABASE_URL:?set DATABASE_URL}" -tAc "select count(*) from sessions;"

echo "first burst: expect 401s then one 429"
for i in $(seq 1 "$THRESHOLD"); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 2 "$BASE/api/v1/me")
  echo "  $i $code"
done

echo "second burst: expect the lock"
for i in $(seq 1 "$THRESHOLD"); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 2 "$BASE/api/v1/me")
  echo "  $i $code"
  [ "$code" = "503" ] && break
done

echo
echo "ready:"
curl -s "$BASE/health/ready" || true
echo
echo "sessions after:"
psql "${DATABASE_URL:?set DATABASE_URL}" -tAc "select count(*) from sessions;"
echo "alerts:"
psql "${DATABASE_URL:?set DATABASE_URL}" -tAc "select rule_id, priority, state from alerts where rule_id like 'SECURITY-TRIP%' order by rule_id;"
echo "flag file:"
if [ -f data/trip.lock ]; then echo "  present"; else echo "  absent"; fi
echo
echo "Reopen: stop the regulator, start it with TRIP_OPEN=1, then reseed both"
echo "databases and run node tools/org-sender.ts --register."
