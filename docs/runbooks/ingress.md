# Ingress and TLS edge

Purpose: serve the UI over TLS without exposing the app directly.

```bash
caddy validate --config infra/caddy/Caddyfile --adapter caddyfile
caddy run --config infra/caddy/Caddyfile --adapter caddyfile
curl -sI https://localhost:8443/health/live
```

The app binds 127.0.0.1:8100. Caddy listens on 8443 and proxies only loopback.
HSTS, nosniff, frame deny, referrer policy, CSP and body cap are set. The
Caddyfile includes the scan hostname `host.docker.internal` for ZAP; remove it
if the scan target is not needed.
Trust: the local root is in the login keychain. System trust needs an admin
prompt. Remove with `caddy untrust` or Keychain Access.
Rollback: stop Caddy and use the loopback app only. Do not expose 8100 on a
non-loopback address.
