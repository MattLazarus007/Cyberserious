#!/usr/bin/env bash
# Wazuh manager and agent for the phase 12 sensor lab. Lab only.
#
# The 4.14.9 images carry both amd64 and arm64 manifests. The platform
# follows the host, so an arm64 Mac runs the native arm64 image. Forcing
# linux/amd64 on an arm64 host runs under emulation, where the manager
# exits 139, so the start actions refuse that unless WAZUH_ALLOW_EMULATION=1.
# Evidence sits in docs/runbooks/sensor.md.
#
# The script sets the lab password with docker exec and creates /lab
# inside the container, so no host path is mounted.
#
# Manager and agent must share a minor version: Docker Hub carries no
# wazuh-agent below 4.13.0, so both stay at 4.14.9.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tag="${WAZUH_TAG:-4.14.9}"
host_arch="$(uname -m)"
if [ "${WAZUH_PLATFORM:-auto}" = "auto" ]; then
  if [ "$host_arch" = "x86_64" ]; then platform="linux/amd64"; else platform="linux/arm64"; fi
else
  platform="$WAZUH_PLATFORM"
fi
manager_image="wazuh/wazuh-manager:${tag}"
agent_image="wazuh/wazuh-agent:${tag}"
manager_name="wz-manager"
agent_name="wz-agent"
network="wz-lab"
agent_name_lab="${WAZUH_AGENT_NAME:-lab-agent}"
enroll_password="${WAZUH_ENROLL_PASSWORD:-lab-enroll-secret}"
alerts_out="$root/infra/sensor/out/wazuh-alerts.json"

present() { docker ps -a --format '{{.Names}}' | grep -qx "$1"; }
running() { docker ps --format '{{.Names}}' | grep -qx "$1"; }

# A forced amd64 image on an arm64 engine runs under emulation, where the
# manager dies with exit 139 before it writes a log line. Refuse that case
# so the failure is clear. Status still works.
require_native() {
  if [ "$platform" = "linux/amd64" ] && [ "$host_arch" != "x86_64" ] && [ "${WAZUH_ALLOW_EMULATION:-0}" != "1" ]; then
    echo "host is $host_arch, the platform was forced to amd64" >&2
    echo "under emulation the manager exits 139 before it writes a log line" >&2
    echo "see docs/runbooks/sensor.md, or set WAZUH_ALLOW_EMULATION=1 to try" >&2
    return 1
  fi
  return 0
}

manager_conf() { docker exec "$manager_name" bash -c "cat /var/ossec/etc/ossec.conf"; }
manager_log_tail() { docker exec "$manager_name" bash -c "tail -n ${1:-40} /var/ossec/logs/ossec.log" 2>/dev/null || true; }

authd_up() {
  # A pid check plus a recent log line, so a stale "Accepting
  # connections" from the previous boot cannot fake readiness.
  docker exec "$manager_name" bash -c '
    set -e
    alive=0
    for p in /proc/[0-9]*/cmdline; do
      if tr "\0" " " < "$p" 2>/dev/null | grep -q "wazuh-authd"; then alive=1; break; fi
    done
    [ "$alive" = 1 ] || exit 1
    tail -n 80 /var/ossec/logs/ossec.log | grep -q "Accepting connections on port 1515"
  ' >/dev/null 2>&1
}

wait_for_authd() {
  echo "waiting for wazuh-authd to listen on 1515"
  for _ in $(seq 1 60); do
    if authd_up; then
      echo "authd is listening on 1515"
      return 0
    fi
    sleep 2
  done
  echo "authd did not come up within 120 seconds" >&2
  manager_log_tail 30 >&2 || true
  return 1
}

# The image ships <use_password>no</use_password>. Flip it and write the
# secret to /var/ossec/etc/authd.pass, which this Wazuh version reads.
# The <password> element is not valid in ossec.conf and stops authd.
set_authd_password() {
  if docker exec "$manager_name" test -s /var/ossec/etc/authd.pass; then
    echo "manager authd already carries a password file"
  else
    echo "setting the authd enrollment password"
    docker exec "$manager_name" bash -c '
      set -e
      conf=/var/ossec/etc/ossec.conf
      sed -i "s|<use_password>no</use_password>|<use_password>yes</use_password>|" "$conf"
      printf "%s" "'"$enroll_password"'" > /var/ossec/etc/authd.pass
      chmod 600 /var/ossec/etc/authd.pass
    '
    docker restart "$manager_name" >/dev/null
    wait_for_authd
  fi
}

start_manager() {
  if running "$manager_name"; then
    echo "manager already running as $manager_name"
  else
    if present "$manager_name"; then
      docker rm "$manager_name" >/dev/null
    fi
    docker network create "$network" >/dev/null 2>&1 || true
    echo "starting the manager on the image's own entry point"
    docker run --detach --name "$manager_name" \
      --platform "$platform" \
      --network "$network" \
      "$manager_image" >/dev/null
    wait_for_authd
  fi
  set_authd_password
  if manager_conf | grep -q "<use_password>yes</use_password>"; then
    echo "enrollment password is enforced on 1515"
  else
    echo "manager is accepting enrollments WITHOUT a password" >&2
    return 1
  fi
}

# The agent watches /lab in realtime so a new file raises a syscheck
# (FIM) alert within seconds instead of waiting for the next full scan.
configure_lab_watch() {
  docker exec "$agent_name" bash -c '
    set -e
    conf=/var/ossec/etc/ossec.conf
    mkdir -p /lab
    if ! grep -q "/lab</directories>" "$conf"; then
      sed -i "s|<directories>/etc,/usr/bin,/usr/sbin</directories>|<directories>/etc,/usr/bin,/usr/sbin</directories>\n    <directories realtime=\"yes\" report_changes=\"yes\">/lab</directories>|" "$conf"
    fi
    grep -q "/lab</directories>" "$conf"
  '
}

start_agent() {
  if running "$agent_name"; then
    echo "agent already running as $agent_name"
  else
    if present "$agent_name"; then
      docker rm "$agent_name" >/dev/null
    fi
    docker network inspect "$network" >/dev/null 2>&1 || docker network create "$network" >/dev/null
    echo "starting the agent against $manager_name as $agent_name_lab"
    docker run --detach --name "$agent_name" \
      --platform "$platform" \
      --network "$network" \
      -e WAZUH_MANAGER_SERVER="$manager_name" \
      -e WAZUH_AGENT_NAME="$agent_name_lab" \
      -e WAZUH_REGISTRATION_PASSWORD="$enroll_password" \
      "$agent_image" >/dev/null
    echo "waiting for the agent to enroll"
    for _ in $(seq 1 45); do
      if manager_log_tail 40 | grep -q "Agent key generated for '$agent_name_lab'"; then
        echo "agent key issued for $agent_name_lab"
        break
      fi
      if [ "$_" = 45 ]; then
        echo "no agent key within 90 seconds" >&2
        manager_log_tail 30 >&2 || true
        return 1
      fi
      sleep 2
    done
  fi
  configure_lab_watch
  echo "restarting the agent so syscheck picks up /lab"
  docker restart "$agent_name" >/dev/null
  sleep 12
  for _ in $(seq 1 30); do
    if docker exec "$agent_name" bash -c "tail -n 40 /var/ossec/logs/ossec.log 2>/dev/null | grep -q 'File integrity monitoring scan ended'"; then
      echo "syscheck is running with /lab watched"
      return 0
    fi
    sleep 2
  done
  echo "syscheck did not report a finished scan" >&2
  return 1
}

# Prove the password is really enforced: enroll a throwaway agent with
# no password and expect the manager to refuse it.
verify_password() {
  echo "attempting an enrollment without the password (expected to fail)"
  local out
  out="$(docker run --rm --platform "$platform" --network "$network" \
    --entrypoint /var/ossec/bin/wazuh-agent-auth \
    "$agent_image" -m "$manager_name" -p 1515 -A lab-nopass 2>&1 || true)"
  if echo "$out" | grep -qi "invalid password\|authorization\|error"; then
    echo "manager refused the passwordless enrollment"
    echo "agent-auth said: $(echo "$out" | tail -n 2 | tr '\n' ' ')"
    return 0
  fi
  if manager_log_tail 40 | grep -q "Agent key generated for 'lab-nopass'"; then
    echo "manager issued a key without a password, enrollment is not enforced" >&2
    return 1
  fi
  echo "no key was issued for lab-nopass, manager side says:"
  manager_log_tail 15 | tail -n 6
}

probe() {
  local stamp file
  stamp="$(date +%s)"
  file="/lab/probe-$stamp.txt"
  docker exec "$agent_name" bash -c "echo 'lab probe $stamp' > $file"
  echo "wrote $file inside $agent_name, syscheck should alert within seconds"
}

alerts() {
  mkdir -p "$(dirname "$alerts_out")"
  docker exec "$manager_name" cat /var/ossec/logs/alerts/alerts.json >"$alerts_out"
  echo "wrote $(wc -l <"$alerts_out" | tr -d ' ') alert lines to $alerts_out"
}

ship() {
  node "$root/scripts/sensor-shipper.mjs" --wazuh "$alerts_out" "$@"
}

status() {
  if running "$manager_name"; then
    echo "manager: running"
    docker exec "$manager_name" bash -c "/var/ossec/bin/wazuh-control status" 2>/dev/null || true
    echo "authd: $(manager_conf | grep -q '<use_password>yes</use_password>' && echo 'password required' || echo 'NO password')"
    echo "--- registered agents ---"
    docker exec "$manager_name" bash -c "/var/ossec/bin/agent_control -l" 2>/dev/null || true
  else
    echo "manager: not running"
  fi
  if running "$agent_name"; then
    echo "agent: running"
    docker exec "$agent_name" bash -c "/var/ossec/bin/wazuh-control status" 2>/dev/null || true
  else
    echo "agent: not running"
  fi
}

stop() {
  if present "$agent_name"; then
    docker rm --force "$agent_name" >/dev/null
    echo "agent removed"
  fi
  if present "$manager_name"; then
    docker rm --force "$manager_name" >/dev/null
    echo "manager removed"
  fi
  docker network rm "$network" >/dev/null 2>&1 || true
}

case "${1:-start}" in
  start)
    require_native || exit 2
    start_manager
    start_agent
    status
    ;;
  manager)
    require_native || exit 2
    start_manager
    ;;
  agent)
    require_native || exit 2
    start_agent
    ;;
  verify)
    require_native || exit 2
    verify_password
    ;;
  probe)
    probe
    ;;
  alerts)
    alerts
    ;;
  ship)
    shift
    ship "$@"
    ;;
  status)
    status
    ;;
  stop)
    stop
    ;;
  *)
    echo "usage: bash scripts/wazuh.sh [start|manager|agent|verify|probe|alerts|ship|status|stop]" >&2
    exit 2
    ;;
esac
