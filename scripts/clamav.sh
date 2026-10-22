#!/bin/bash
# ClamAV for the lab: user owned, unix socket only, no TCP port.
#   setup   render configs
#   update  fetch signatures
#   start   run clamd in the background
#   stop    shut it down
#   status  daemon and database state
#   test    EICAR detection proof
#   scan <path>  scan one file or directory
#   agents   install user launch agents for clamd and freshclam
#   unagents remove them
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/data/clamav"
CONF="$DIR/clamd.conf"
FRESH="$DIR/freshclam.conf"
SOCK="$DIR/clamd.sock"
PID="$DIR/clamd.pid"
CLAMD="${CLAMD:-$(command -v clamd || echo /opt/homebrew/opt/clamav/sbin/clamd)}"

usage() {
  echo "usage: $0 setup|update|start|stop|status|test|scan <path>" >&2
  exit 2
}

render() {
  mkdir -p "$DIR/db"
  sed "s#@REPO@#$ROOT#g" "$ROOT/infra/clamav/clamd.conf.in" > "$CONF"
  sed "s#@REPO@#$ROOT#g" "$ROOT/infra/clamav/freshclam.conf.in" > "$FRESH"
  chmod 600 "$CONF" "$FRESH"
  echo "configs written to $DIR"
}

running() {
  [ -S "$SOCK" ] && [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null
}

instances() {
  pgrep -f "clamd --config-file=$CONF" 2>/dev/null || true
}

case "${1:-}" in
  setup)
    render
    ;;
  update)
    [ -f "$FRESH" ] || render
    freshclam --config-file="$FRESH"
    ;;
  start)
    [ -f "$CONF" ] || render
    if running; then
      echo "already running"
      exit 0
    fi
    if [ -n "$(instances)" ]; then
      echo "a clamd for this config is already alive without a socket; stop it first" >&2
      exit 1
    fi
    nohup "$CLAMD" --config-file="$CONF" >"$DIR/clamd.out" 2>&1 &
    for _ in $(seq 1 30); do
      running && break
      sleep 1
    done
    if running; then
      echo "clamd running on $SOCK"
    else
      echo "clamd did not start; see $DIR/clamd.log" >&2
      exit 1
    fi
    ;;
  stop)
    pids="$(instances)"
    if [ -n "$pids" ]; then
      kill $pids 2>/dev/null || true
      for _ in $(seq 1 10); do
        [ -z "$(instances)" ] && break
        sleep 1
      done
      [ -n "$(instances)" ] && kill -9 $(instances) 2>/dev/null || true
    fi
    rm -f "$PID" "$SOCK"
    echo "clamd stopped"
    ;;
  status)
    if running; then
      echo "daemon: running ($(cat "$PID"))"
    else
      echo "daemon: stopped"
    fi
    if [ -f "$DIR/db/main.cvd" ] || [ -f "$DIR/db/main.cld" ]; then
      echo "database: $(ls "$DIR/db" | tr '\n' ' ')"
    else
      echo "database: absent, run update"
    fi
    [ -f "$DIR/freshclam.log" ] && tail -2 "$DIR/freshclam.log" || true
    ;;
  test)
    running || { echo "start clamd first" >&2; exit 1; }
    tmp="$(mktemp -t eicar.XXXXXX)"
    trap 'rm -f "$tmp"' EXIT
    printf '%s' 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > "$tmp"
    set +e
    out="$(clamdscan --config-file="$CONF" --fdpass --no-summary "$tmp" 2>&1)"
    code=$?
    set -e
    echo "$out"
    if [ "$code" -eq 1 ] && echo "$out" | grep -qi "FOUND"; then
      echo "EICAR detected as expected"
      exit 0
    fi
    echo "EICAR was not detected" >&2
    exit 1
    ;;
  agents)
    [ -f "$CONF" ] || render
    dest="$HOME/Library/LaunchAgents"
    mkdir -p "$dest"
    if running; then
      "$0" stop
    fi
    for unit in clamd freshclam; do
      sed "s#@REPO@#$ROOT#g" "$ROOT/infra/launchd/com.cyberserious.$unit.plist.in" > "$dest/com.cyberserious.$unit.plist"
      launchctl bootout "gui/$(id -u)" "$dest/com.cyberserious.$unit.plist" >/dev/null 2>&1 || true
      launchctl bootstrap "gui/$(id -u)" "$dest/com.cyberserious.$unit.plist"
    done
    echo "agents installed"
    ;;
  unagents)
    for unit in clamd freshclam; do
      unit_path="$HOME/Library/LaunchAgents/com.cyberserious.$unit.plist"
      launchctl bootout "gui/$(id -u)" "$unit_path" >/dev/null 2>&1 || true
      rm -f "$unit_path"
    done
    echo "agents removed"
    ;;
  scan)
    [ -n "${2:-}" ] || usage
    running || { echo "start clamd first" >&2; exit 1; }
    exec clamdscan --config-file="$CONF" --fdpass --no-summary "$2"
    ;;
  *)
    usage
    ;;
esac
