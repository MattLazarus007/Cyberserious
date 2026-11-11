#!/bin/bash
# Sweep the local port range and report every listener it finds.
# Read only. Writes nothing except stdout.
set -uo pipefail

RANGE_START=8000
RANGE_END=8500
FOUND=0

echo "# port sweep on 127.0.0.1, range ${RANGE_START}-${RANGE_END}"
for port in $(seq "$RANGE_START" "$RANGE_END"); do
  if nc -z -G 1 127.0.0.1 "$port" 2>/dev/null; then
    echo "open  ${port}"
    FOUND=$((FOUND + 1))
  fi
done

echo
echo "open ports found: ${FOUND}"
echo
echo "# listening sockets, all interfaces"
lsof -nP -iTCP -sTCP:LISTEN | awk 'NR>1 {print $1, $2, $8, $9}' | sort -u
