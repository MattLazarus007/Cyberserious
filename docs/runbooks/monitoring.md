# Monitoring and detection

Purpose: show whether controls are alive and what needs a human.

Sources: Suricata `eve.json`, osquery inventory, Vector pipeline, the app WAF
and rate limiter, ClamAV, backup age, the trip file and the audit chain.

```bash
curl -s http://127.0.0.1:8100/health/ready
curl -s -b "$COOKIE" http://127.0.0.1:8100/api/v1/security/state
node scripts/verify-chain.mjs
bash scripts/clamav.sh status
bash scripts/osquery.sh status
sudo bash scripts/pf-firewall.sh status
```

Start and stop: `caddy run` is foreground. ClamAV and osquery use launchd.
Vector starts with `vector --config infra/vector/vector.toml`.
Logs: `data/logs/caddy.log`, `data/logs/suricata/`, `data/clamav/`,
`/var/log/osquery/`.
Verification: ingest one event and see it on the security page; stop a source
and watch the heartbeat turn silent after 15 minutes.
Rollback: stop the collector, the page keeps the last state and the chain
remains readable. A silent source is a finding, not an empty screen.
