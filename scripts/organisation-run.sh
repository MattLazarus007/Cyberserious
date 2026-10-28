#!/bin/bash
# Load the lab environment, then run the organisation server in the foreground.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "$ROOT/scripts/env.sh"
exec node "$ROOT/apps/organisation/server/index.ts"
