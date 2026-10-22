#!/bin/bash
# Host telemetry helper for the lab.
#   status   version, daemon state and one inventory query
#   query Q  run one read-only query through osqueryi
#   config   validate the JSON config
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${OSQUERY_BIN:-/usr/local/bin/osqueryi}"
CONF="$ROOT/infra/osquery/osquery.conf"

case "${1:-}" in
  status)
    "$BIN" --version
    launchctl print system/io.osquery.agent >/dev/null 2>&1 && echo "daemon: loaded" || echo "daemon: not loaded"
    "$BIN" "select count(*) as listening from listening_ports;"
    ;;
  query)
    [ -n "${2:-}" ] || { echo "usage: $0 query <sql>" >&2; exit 2; }
    "$BIN" "$2"
    ;;
  config)
    node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log("config: valid json")' "$CONF"
    ;;
  *)
    echo "usage: $0 status|query <sql>|config" >&2
    exit 2
    ;;
esac
