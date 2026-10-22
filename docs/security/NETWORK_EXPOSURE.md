# Network exposure

Both apps bind `127.0.0.1` unless `HOST` is set on purpose. The default
is the control. The `HOST` override exists for a container or a host
that fronts the app with a local proxy, and it logs the address it used.

## Listeners

| Port | Service | Bind | Notes |
| --- | --- | --- | --- |
| 8100 | regulator UI and API | loopback | demo traffic |
| 8101 | regulator mTLS intake | loopback | certificate required |
| 8200 | organisation portal | loopback | demo traffic |
| 8443 | Caddy, when started | loopback | planned TLS front |
| 5432 | Postgres | loopback | local only |

## Request path

1. `securityHeaders` sets the isolation, framing, and permissions
   headers and `no-store` for API responses.
2. `requestGuard` refuses a mutating request whose `Sec-Fetch-Site` is
   `cross-site` or whose `Origin` does not match the host. A request
   with no fetch metadata is allowed because that is the non-browser
   path, which uses the internal token or a bearer credential. This is
   recorded as a limitation, not hidden.
3. `securityTrip` answers 503 while the lock is engaged, except for
   readiness.
4. Routers apply session, role, and organisation scope.

## Proxy trust

`trust proxy` is `loopback` only. An `X-Forwarded-Proto` header from a
remote address is ignored, so HSTS and origin checks cannot be flipped
by a caller on the network. When Caddy fronts the app, it connects from
loopback and its forwarded headers are trusted.

## Verify

```bash
lsof -nP -iTCP:8100 -sTCP:LISTEN
lsof -nP -iTCP:8200 -sTCP:LISTEN
```

Expected `127.0.0.1` on both lines. From another host, a connection to
the LAN address on either port must fail.

## Limits

No rate limiter yet. The trip wire is a global circuit breaker, not a
per-client throttle, and it is deliberately blunt. Per-route limits,
the ban list, and the WAF rules arrive with the ingress work. Until
then the loopback bind and the host firewall carry the exposure
reduction.
