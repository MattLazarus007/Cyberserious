#!/bin/bash
# Vector shipper supervision.
#   run        foreground process with the lab environment loaded
#   status     launch agent state and the last ingest attempt
#   install    install the launch agent and start it
#   uninstall  stop it and remove the launch agent
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.cyberserious.vector"
UNIT="$HOME/Library/LaunchAgents/$LABEL.plist"

case "${1:-}" in
  run)
    exec "$ROOT/scripts/vector-run.sh"
    ;;
  status)
    if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
      echo "agent loaded"
    else
      echo "agent not loaded"
    fi
    lsof -nP -iTCP:8100 -sTCP:ESTABLISHED 2>/dev/null | tail -n +2 | head -5 || true
    ;;
  install)
    mkdir -p "$ROOT/data/logs" "$HOME/Library/LaunchAgents"
    sed "s#@REPO@#$ROOT#g" "$ROOT/infra/launchd/$LABEL.plist.in" > "$UNIT"
    launchctl bootout "gui/$(id -u)" "$UNIT" >/dev/null 2>&1 || true
    launchctl bootstrap "gui/$(id -u)" "$UNIT"
    echo "vector agent installed"
    ;;
  uninstall)
    launchctl bootout "gui/$(id -u)" "$UNIT" >/dev/null 2>&1 || true
    rm -f "$UNIT"
    echo "vector agent removed"
    ;;
  *)
    echo "usage: $0 run|status|install|uninstall" >&2
    exit 2
    ;;
esac
