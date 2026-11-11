#!/bin/bash
# Sends one host telemetry heartbeat after a real osquery inventory read.
# Scheduled by com.cyberserious.osquery-heartbeat every 15 minutes.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck disable=SC1091
source scripts/env.sh >/dev/null 2>&1
exec node scripts/osquery-heartbeat.mjs
