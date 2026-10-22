#!/bin/bash
# Read-only host posture. No sudo, no changes, no secrets.
set -uo pipefail

status() {
  printf '%-28s %-8s %s\n' "$1" "$2" "$3"
}

check() {
  local name="$1" hint="$2"
  shift 2
  if out="$("$@" 2>&1)"; then
    status "$name" "PASS" "$(echo "$out" | head -1)"
  else
    status "$name" "WARN" "$hint"
  fi
}

echo "cyberserious host posture, $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "host: $(hostname)  os: $(sw_vers -productVersion)  arch: $(uname -m)"
echo

if fv="$(fdesetup status 2>&1)"; then
  case "$fv" in
    *"FileVault is On"*) status "filevault" "PASS" "$fv" ;;
    *) status "filevault" "FAIL" "$fv" ;;
  esac
else
  status "filevault" "UNKNOWN" "fdesetup unavailable"
fi

if fw="$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>&1)"; then
  case "$fw" in
    *enabled*) status "application firewall" "PASS" "$fw" ;;
    *) status "application firewall" "FAIL" "$fw" ;;
  esac
else
  status "application firewall" "UNKNOWN" "needs an admin session"
fi

if pf="$(pfctl -s info 2>&1)"; then
  if echo "$pf" | grep -q "Status: Enabled"; then
    status "pf" "PASS" "enabled"
  else
    status "pf" "WARN" "disabled or unreadable"
  fi
else
  status "pf" "UNKNOWN" "needs sudo"
fi

if gate="$(spctl --status 2>&1)"; then
  status "gatekeeper" "INFO" "$gate"
fi

auto="$(defaults read /Library/Preferences/com.apple.SoftwareUpdate AutomaticCheckEnabled 2>/dev/null || echo unknown)"
case "$auto" in
  1) status "automatic updates" "PASS" "check enabled" ;;
  0) status "automatic updates" "WARN" "check disabled" ;;
  *) status "automatic updates" "UNKNOWN" "not readable" ;;
esac

guest="$(defaults read /Library/Preferences/com.apple.loginwindow GuestEnabled 2>/dev/null || echo unknown)"
case "$guest" in
  1) status "guest account" "FAIL" "enabled" ;;
  0) status "guest account" "PASS" "disabled" ;;
  *) status "guest account" "UNKNOWN" "not readable" ;;
esac

screen="$(sysadminctl -screenLock status 2>&1 || echo unknown)"
status "screen lock" "INFO" "$(echo "$screen" | head -1)"

echo
echo "listening tcp sockets"
lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR==1 || /LISTEN/' | head -20

echo
free_gb="$(df -g . | awk 'NR==2 {print $4}')"
status "free disk" "$([ "${free_gb:-0}" -ge 5 ] && echo PASS || echo FAIL)" "${free_gb} GiB"
