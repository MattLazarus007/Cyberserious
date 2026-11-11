#!/bin/bash
# Load the lab environment, then run the regulator server in the foreground.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "$ROOT/scripts/env.sh"
export GROUP_LOGIN="${GROUP_LOGIN:-1}"
export GROUP_PASSPHRASE="${GROUP_PASSPHRASE:-group-demo-2026}"
exec node "$ROOT/apps/regulator/server/index.ts"
