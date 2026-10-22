# TLS front

Caddy terminates TLS on `https://localhost:8443` and proxies to the
regulator on `127.0.0.1:8100`. The app stays loopback bound. The proxy
is the only listener a browser talks to.

## Run

```bash
bash scripts/caddy.sh validate
bash scripts/caddy.sh run
bash scripts/caddy.sh status
```

`status` uses `-k` because the local CA is not trusted yet. The browser
shows a warning until the root is installed:

```bash
sudo caddy trust
```

That is a manual admin step. `trust` in the script prints the command
rather than running it, because the session has no terminal for a
password. Remove with `sudo caddy untrust`.

## Proof on 22 October 2026

`caddy validate` answered `Valid configuration`. With the proxy
running, `GET https://localhost:8443/health/live` returned
`{"ok":true}` and the response carried
`strict-transport-security`, `x-content-type-options`, and
`x-frame-options`. The `Server` header was removed.

## Why this is not the whole answer

- The certificate is local. A public deployment needs a real hostname
  and ACME, not `tls internal`.
- Trusting the local CA makes the padlock appear for every site that
  chain trusts on this machine. Use it for the demo, then untrust.
- The app sees `X-Forwarded-Proto` from loopback and `trust proxy` is
  set to loopback, so HSTS and origin checks work through the proxy.
  A request from the network cannot spoof that header.
- Caddy limits request bodies to 12 MB, slightly above the app's 10 MiB
  evidence cap. The app still enforces its own limit.
