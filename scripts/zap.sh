#!/bin/bash
# Run the ZAP automation plan against the TLS edge and keep the reports.
# Needs the colima daemon and the Caddy local root certificate.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$HOME/Library/Application Support/Caddy/pki/authorities/local/root.crt"
OUT=docs/security

if ! docker info >/dev/null 2>&1; then
  echo "the container engine is not running; start it with: colima start" >&2
  exit 1
fi

if [ ! -f "$ROOT" ]; then
  echo "the Caddy local root certificate is missing at $ROOT" >&2
  exit 1
fi

docker run --rm \
  --add-host=host.docker.internal:host-gateway \
  -v "$PWD/$OUT:/zap/wrk:rw" \
  -v "$ROOT:/tmp/caddy-root.crt:ro" \
  --entrypoint bash \
  ghcr.io/zaproxy/zaproxy:stable \
  -lc 'set -e
    TS=/tmp/truststore
    cp "$JAVA_HOME/lib/security/cacerts" "$TS"
    keytool -importcert -noprompt -trustcacerts -alias caddy \
      -file /tmp/caddy-root.crt -keystore "$TS" -storepass changeit >/dev/null
    export JAVA_TOOL_OPTIONS="-Djavax.net.ssl.trustStore=$TS -Djavax.net.ssl.trustStorePassword=changeit"
    /zap/zap.sh -cmd -autorun /zap/wrk/zap.yaml' 2>&1 | tail -20

if [ ! -s "$OUT/dast.json" ]; then
  echo "the scan wrote no report" >&2
  exit 1
fi

jq -r '[.site[].alerts[] | .riskdesc] | group_by(.) | map("\(length) \(.[0])") | .[]' \
  "$OUT/dast.json"
