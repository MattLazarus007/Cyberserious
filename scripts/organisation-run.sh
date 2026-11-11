#!/bin/bash
# Load the lab environment, then run the organisation server in the foreground.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "$ROOT/scripts/env.sh"
# The portal signs its intake posts with this key. Without the path the send
# route answers 500, so the service sets it here rather than in the plist.
export ORG_SENDER_ID="${ORG_SENDER_ID:-org-karoo-01}"
export ORG_SENDER_KEY="${ORG_SENDER_KEY:-$ROOT/keys/org-sender.json}"
exec node "$ROOT/apps/organisation/server/index.ts"
