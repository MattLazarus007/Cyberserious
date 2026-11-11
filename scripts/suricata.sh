#!/bin/bash
# Suricata sensor supervision. The live capture needs root.
#   replay     run the fixture, no root
#   status     launch daemon state and the latest alert count
#   install    write the launch daemon and start it (root)
#   uninstall  stop it and remove the launch daemon (root)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.cyberserious.suricata"
UNIT="/Library/LaunchDaemons/$LABEL.plist"

case "${1:-}" in
  replay)
    node "$ROOT/scripts/build-fixture-pcap.mjs" /tmp/sensor-fixture.pcap
    rm -rf /tmp/sensor-replay
    mkdir -p /tmp/sensor-replay
    suricata -c "$ROOT/infra/sensor/suricata.yaml" -S "$ROOT/infra/sensor/local.rules" \
      -r /tmp/sensor-fixture.pcap -l /tmp/sensor-replay
    grep -c '"event_type":"alert"' /tmp/sensor-replay/eve.json
    ;;
  status)
    if launchctl print "system/$LABEL" >/dev/null 2>&1; then
      echo "daemon loaded"
    else
      echo "daemon not loaded"
    fi
    if [ -f "$ROOT/infra/sensor/out/eve.json" ]; then
      grep -c '"event_type":"alert"' "$ROOT/infra/sensor/out/eve.json" || true
    else
      echo "no eve log yet"
    fi
    ;;
  install)
    if [ "$(id -u)" -ne 0 ]; then
      echo "install needs root: sudo bash scripts/suricata.sh install" >&2
      exit 2
    fi
    mkdir -p "$ROOT/data/logs" "$ROOT/infra/sensor/out"
    sed "s#@REPO@#$ROOT#g" "$ROOT/infra/launchd/$LABEL.plist.in" > "$UNIT"
    chmod 644 "$UNIT"
    launchctl bootout "system/$LABEL" >/dev/null 2>&1 || true
    launchctl bootstrap system "$UNIT"
    echo "suricata daemon installed"
    ;;
  uninstall)
    if [ "$(id -u)" -ne 0 ]; then
      echo "uninstall needs root: sudo bash scripts/suricata.sh uninstall" >&2
      exit 2
    fi
    launchctl bootout "system/$LABEL" >/dev/null 2>&1 || true
    rm -f "$UNIT"
    echo "suricata daemon removed"
    ;;
  *)
    echo "usage: $0 replay|status|install|uninstall" >&2
    exit 2
    ;;
esac
