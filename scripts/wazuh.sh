#!/usr/bin/env bash
# Wazuh manager and agent for the phase 12 sensor lab, amd64 images on
# this arm64 machine so they run under colima's emulation. Lab only.
#
# What this script does differently from the earlier draft: it runs the
# image's own entry point (the "manual permanent data" workaround was
# built on a segfault claim that did not reproduce, and the host bind
# mount of a config file into /wazuh-config-mount is what actually
# crashed s6 with "child crashed with signal 11"). The lab password is
# therefore set with docker exec + docker restart, and the agent's
# watched /lab directory is created inside the container so no host
# path has to be mounted.
#
# Manager and agent must share a minor version: Docker Hub carries no
# wazuh-agent below 4.13.0, so the lab pins both to 4.14.9.
#
# This arm64 host cannot run the manager. Under emulation the container
# exits 139 after about 100 ms and writes no log line. The evidence sits
# in STATUS.md and docs/runbooks/sensor.md. Start this script on a
# linux/amd64 host.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tag="${WAZUH_TAG:-4.14.9}"
platform="${WAZUH_PLATFORM:-linux/amd64}"
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

# The image ships <use_password>no</use_password>. Flip it and add the
# password, then restart so authd reads it. Idempotent.
set_authd_password() {
  if docker exec "$manager_name" bash -c 'grep -q "<password>" /var/ossec/etc/ossec.conf'; then
    echo "manager authd already carries a password"
    return 0
  fi
  echo "setting the authd enrollment password"
  docker exec "$manager_name" bash -c '
    set -e
    conf=/var/ossec/etc/ossec.conf
    sed -i "s|<use_password>no</use_password>|<use_password>yes</use_password>|" "$conf"
    sed -i "/<use_password>yes<\/use_password>/a\\    <password>'"$enroll_password"'</password>" "$conf"
    grep -q "<password>$enroll_password</password>" "$conf"
  '
  docker restart "$manager_name" >/dev/null
  wait_for_authd
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
    start_manager
    start_agent
    status
    ;;
  manager)
    start_manager
    ;;
  agent)
    start_agent
    ;;
  verify)
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
