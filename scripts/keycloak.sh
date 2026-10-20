#!/usr/bin/env bash
# Keycloak in a container, the lab identity provider for ADR-0003.
# The realm cyberserious imports from infra/keycloak/realm-export.json
# on first start, so the client, the three lab users and the brute
# force settings all travel with the file. Idempotent: a running
# container is left alone, a stopped one is replaced, and `stop`
# removes the container and the realm data with it. Lab only.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="quay.io/keycloak/keycloak:26.0"
name="kc-lab"
# 18080 rather than the Keycloak default 8080: something else in the
# lab already listens on 8080, and docker cannot claim a busy port.
port="${KEYCLOAK_PORT:-18080}"
discovery="http://localhost:${port}/realms/cyberserious/.well-known/openid-configuration"

present() {
  docker ps -a --format '{{.Names}}' | grep -qx "$name"
}

running() {
  docker ps --format '{{.Names}}' | grep -qx "$name"
}

case "${1:-start}" in
  stop)
    if present; then
      docker rm --force "$name" >/dev/null
      echo "keycloak container removed, the realm and its users go with it"
    else
      echo "no keycloak container to remove"
    fi
    ;;

  start)
    if running; then
      echo "keycloak already running as $name on port $port"
    else
      if present; then
        docker rm "$name" >/dev/null
      fi
      # An admin is optional. Nothing in the demo needs one: the
      # realm, the client and the three lab users all arrive from the
      # export file, and the regulator only talks to discovery, jwks
      # and the token endpoint.
      admin=()
      if [ -n "${KEYCLOAK_ADMIN_USERNAME:-}" ] && [ -n "${KEYCLOAK_ADMIN_PASSWORD:-}" ]; then
        admin=(-e "KC_BOOTSTRAP_ADMIN_USERNAME=${KEYCLOAK_ADMIN_USERNAME}" -e "KC_BOOTSTRAP_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD}")
      fi
      docker run --detach --name "$name" \
        --publish "${port}:8080" \
        --volume "$root/infra/keycloak:/opt/keycloak/data/import" \
        ${admin[@]+"${admin[@]}"} \
        "$image" start-dev --import-realm >/dev/null
      echo "keycloak starting, importing infra/keycloak/realm-export.json"
    fi

    echo "waiting for the cyberserious discovery document"
    for _ in $(seq 1 60); do
      if curl --fail --silent "$discovery" >/dev/null 2>&1; then
        echo "keycloak ready at $discovery"
        exit 0
      fi
      sleep 2
    done
    echo "keycloak did not answer within 120 seconds" >&2
    docker logs --tail 40 "$name" >&2 || true
    exit 1
    ;;

  *)
    echo "usage: bash scripts/keycloak.sh [start|stop]" >&2
    exit 2
    ;;
esac
