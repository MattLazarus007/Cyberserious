#!/bin/bash
# Local TLS front for the regulator UI.
#   validate  check the Caddyfile
#   run       serve https://localhost:8443 in the foreground
#   status    probe through the proxy
#   trust     print the local CA trust command (needs an admin session)
#   install   install the launch agent and start it
#   uninstall stop it and remove the launch agent
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF="$ROOT/infra/caddy/Caddyfile"

usage() {
  echo "usage: $0 validate|run|status|trust|install|uninstall" >&2
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
  install)
    mkdir -p "$ROOT/data/logs"
    dest="$HOME/Library/LaunchAgents"
    mkdir -p "$dest"
    sed "s#@REPO@#$ROOT#g" "$ROOT/infra/launchd/com.cyberserious.caddy.plist.in" > "$dest/com.cyberserious.caddy.plist"
    launchctl bootout "gui/$(id -u)" "$dest/com.cyberserious.caddy.plist" >/dev/null 2>&1 || true
    launchctl bootstrap "gui/$(id -u)" "$dest/com.cyberserious.caddy.plist"
    echo "caddy agent installed"
    ;;
  uninstall)
    unit="$HOME/Library/LaunchAgents/com.cyberserious.caddy.plist"
    launchctl bootout "gui/$(id -u)" "$unit" >/dev/null 2>&1 || true
    rm -f "$unit"
    echo "caddy agent removed"
    ;;
  *)
    usage
    ;;
esac
