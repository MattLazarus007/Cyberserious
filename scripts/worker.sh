#!/bin/bash
# Regulator worker supervision. The worker runs correlation, the daily anchor
# and the retention sweep.
#   run        foreground process with the lab environment loaded
#   status     launch agent state
#   install    install the launch agent and start it
#   uninstall  stop it and remove the launch agent
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.cyberserious.worker"
UNIT="$HOME/Library/LaunchAgents/$LABEL.plist"

case "${1:-}" in
  run)
    exec "$ROOT/scripts/worker-run.sh"
    ;;
  status)
    if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
      echo "agent loaded"
    else
      echo "agent not loaded"
    fi
    ;;
  install)
    mkdir -p "$ROOT/data/logs" "$HOME/Library/LaunchAgents"
    sed "s#@REPO@#$ROOT#g" "$ROOT/infra/launchd/$LABEL.plist.in" > "$UNIT"
    launchctl bootout "gui/$(id -u)" "$UNIT" >/dev/null 2>&1 || true
    launchctl bootstrap "gui/$(id -u)" "$UNIT"
    echo "worker agent installed"
    ;;
  uninstall)
    launchctl bootout "gui/$(id -u)" "$UNIT" >/dev/null 2>&1 || true
    rm -f "$UNIT"
    echo "worker agent removed"
    ;;
  *)
    echo "usage: $0 run|status|install|uninstall" >&2
    exit 2
    ;;
esac
