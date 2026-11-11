#!/bin/bash
# Vector needs the collector token as a literal header value. Render a
# private copy of the config, then hand the process to vector. The copy is
# removed when this wrapper exits, including on a launchd stop.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "$ROOT/scripts/env.sh"
if [ -z "${INTERNAL_TOKEN:-}" ]; then
  echo "INTERNAL_TOKEN is not set; refusing to start the shipper" >&2
  exit 78
fi
umask 077
runtime="$(mktemp "${TMPDIR:-/tmp}/cyberserious-vector.XXXXXX")"
trap 'rm -f "$runtime"' EXIT
sed "s#__INTERNAL_TOKEN__#$INTERNAL_TOKEN#g" "$ROOT/infra/vector/vector.toml" > "$runtime"
export VECTOR_LOG="${VECTOR_LOG:-info}"
vector --config "$runtime" &
wait $!
