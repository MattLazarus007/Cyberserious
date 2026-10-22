#!/bin/bash
# Local TLS front for the regulator UI.
#   validate  check the Caddyfile
#   run       serve https://localhost:8443 in the foreground
#   status    probe through the proxy
#   trust     install the local CA (needs an admin session)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF="$ROOT/infra/caddy/Caddyfile"

usage() {
  echo "usage: $0 validate|run|status|trust" >&2
  exit 2
}

case "${1:-}" in
  validate)
    caddy validate --config "$CONF" --adapter caddyfile
    ;;
  run)
    mkdir -p "$ROOT/data/logs"
    exec caddy run --config "$CONF" --adapter caddyfile
    ;;
  status)
    curl -sk --max-time 3 https://localhost:8443/health/live
    echo
    ;;
  trust)
    echo "this writes the local root into the system trust store" >&2
    echo "run: sudo caddy trust" >&2
    echo "remove with: sudo caddy untrust" >&2
    ;;
  *)
    usage
    ;;
esac
