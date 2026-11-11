#!/bin/bash
# Host packet filter for the lab.
#   --print   show the anchor without touching anything
#   apply     install the anchor and load it (root, needs --yes)
#   status    show loaded rules (root)
#   ban IP    add an address to the bad table (root)
#   unban IP  remove it (root)
#   flush     unload the anchor and remove the bad table (root, needs --yes)
set -euo pipefail

ANCHOR_NAME="cyberserious"
ANCHOR_SRC="infra/pf/cyberserious.anchor"
ANCHOR_DST="/etc/pf.anchors/$ANCHOR_NAME"
PF_CONF="/etc/pf.conf"
PLIST="infra/launchd/com.cyberserious.pf.plist"
PLIST_DST="/Library/LaunchDaemons/com.cyberserious.pf.plist"

usage() {
  echo "usage: $0 --print|apply|status|ban <ip>|unban <ip>|flush" >&2
  exit 2
}

need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "needs root: sudo bash $0 ${1:-}" >&2
    exit 1
  fi
}

case "${1:-}" in
  --print)
    cat "$ANCHOR_SRC"
    ;;
  apply)
    need_root apply
    if [ "${2:-}" != "--yes" ]; then
      echo "this can lock out a remote shell. re-run with --yes when you have local access." >&2
      exit 1
    fi
    install -m 600 "$ANCHOR_SRC" "$ANCHOR_DST"
    if ! grep -q "anchor \"$ANCHOR_NAME\"" "$PF_CONF"; then
      cp "$PF_CONF" "$PF_CONF.bak.$(date +%Y%m%d%H%M%S)"
      {
        echo ""
        echo "anchor \"$ANCHOR_NAME\""
        echo "load anchor \"$ANCHOR_NAME\" from \"$ANCHOR_DST\""
      } >> "$PF_CONF"
    fi
    pfctl -e >/dev/null 2>&1 || true
    pfctl -f "$PF_CONF"
    install -m 644 "$PLIST" "$PLIST_DST"
    launchctl bootout system "$PLIST_DST" >/dev/null 2>&1 || true
    launchctl bootstrap system "$PLIST_DST" >/dev/null 2>&1 || true
    echo "anchor loaded"
    ;;
  status)
    need_root status
    pfctl -a "$ANCHOR_NAME" -sr
    echo
    pfctl -t cyberserious_bad -T show 2>/dev/null || true
    ;;
  ban)
    need_root "ban ${2:-}"
    [ -n "${2:-}" ] || usage
    pfctl -t cyberserious_bad -T add "$2"
    echo "banned $2"
    ;;
  unban)
    need_root "unban ${2:-}"
    [ -n "${2:-}" ] || usage
    pfctl -t cyberserious_bad -T delete "$2"
    echo "unbanned $2"
    ;;
  flush)
    need_root flush
    if [ "${2:-}" != "--yes" ]; then
      echo "re-run with --yes" >&2
      exit 1
    fi
    pfctl -a "$ANCHOR_NAME" -F rules >/dev/null 2>&1 || true
    pfctl -t cyberserious_bad -T flush >/dev/null 2>&1 || true
    launchctl bootout system "$PLIST_DST" >/dev/null 2>&1 || true
    rm -f "$PLIST_DST"
    echo "anchor unloaded"
    ;;
  *)
    usage
    ;;
esac
