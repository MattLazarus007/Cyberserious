#!/bin/bash
# Unauthenticated probes against the live regulator. Prints a transcript.
set -uo pipefail
B=http://127.0.0.1:8100
E=https://localhost:8443
P=https://localhost:8444

probe() {
  local label="$1" url="$2"
  printf '%-46s %s\n' "$label" \
    "$(curl -s -o /dev/null -m 4 --path-as-is -w '%{http_code}' "$url")"
}

echo "# unauthenticated probes"
probe "GET /api/v1/me"                "$B/api/v1/me"
probe "GET /api/v1/cases"             "$B/api/v1/cases"
probe "GET /api/v1/users"             "$B/api/v1/users"
probe "GET /api/v1/audit"             "$B/api/v1/audit"
probe "SQL injection probe"           "$B/api/v1/cases?q=%27%20OR%201%3D1--"
probe "XSS probe"                     "$B/api/v1/cases?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E"
probe "path traversal probe"          "$B/../../etc/passwd"
probe "unknown path"                  "$B/nope"

echo
echo "# transport"
curl -s -o /dev/null -m 4 -w 'plain HTTP on 8100 stays loopback  %{http_code}\n' "$B/health/live"
curl -s -o /dev/null -m 4 -w 'regulator edge 8443                 %{http_code}\n' "$E/health/live"
curl -s -o /dev/null -m 4 -w 'portal edge 8444                    %{http_code}\n' "$P/login.html"
for port in 8443 8444; do
  for v in tls1 tls1_1 tls1_2 tls1_3; do
    out=$(openssl s_client -connect localhost:"$port" -servername localhost -"$v" </dev/null 2>&1)
    if printf '%s' "$out" | grep -q 'alert protocol version'; then
      printf '%s %-9s refused: protocol version\n' "$port" "$v"
    elif printf '%s' "$out" | grep -q 'alert internal error'; then
      printf '%s %-9s refused: internal error\n' "$port" "$v"
    else
      printf '%s %-9s %s\n' "$port" "$v" "$(printf '%s' "$out" | grep -m1 -E '^ *Protocol *:' | sed 's/^ *//')"
    fi
  done
done

echo
echo "# response headers"
for edge in "$E/health/live" "$P/login.html"; do
  echo "--- $edge"
  curl -sI -m 4 "$edge" | grep -iE 'strict-transport|x-content-type|x-frame|referrer|content-security|permissions-policy|x-powered-by|cache-control|^server:'
done
echo "--- session cookie"
curl -s -D - -o /dev/null -m 4 -X POST "$E/api/v1/login" -H 'content-type: application/json' \
  -d '{"username":"analyst1","password":"demo-analyst-pass"}' | grep -i '^set-cookie' | sed 's/cs_sid=[a-f0-9]*/cs_sid=<value>/'
echo "--- cache policy"
printf 'api no-store   '; curl -sI -m 4 "$B/api/v1/me" | grep -i '^cache-control' | sed 's/^ *//'
printf 'page cache     '; curl -sI -m 4 "$E/login.html" | grep -i '^cache-control' | sed 's/^ *//' || echo "none"

echo
echo "# listeners"
lsof -nP -iTCP -sTCP:LISTEN | awk '/:(8100|8101|8200|8443|8444)/ {print $1, $2, $8, $9}'
