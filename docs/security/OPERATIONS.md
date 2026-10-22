# Operations cadence and KPIs

The controls need a rhythm. Each check has a command and a place for the result.

## Daily

| Check | Command | Where |
|---|---|---|
| Audit and security chains | `node scripts/verify-chain.mjs` | `data/logs/ops/YYYY-MM-DD.txt` |
| Backup age | `GET /api/v1/security/state` or `ls -lt data/vault/backups` | same |
| Alert triage | `GET /api/v1/alerts`, acknowledge or resolve | alert page |
| Sensor and host heartbeat | security page, silence over 15 minutes | security page |
| Trip state | `test -f data/trip.lock` | same |
| ClamAV freshness | `bash scripts/clamav.sh status` | same |

## Weekly

- `bash scripts/security-scan.sh secrets`
- `bash scripts/security-scan.sh deps`
- Review failed logins and WAF blocks in `audit_events`.
- Review open alerts older than three days.

## Monthly

- Restore rehearsal from the latest sealed archive. Record row counts.
- Check Caddy certificate expiry and `caddy trust` state.
- Review users, roles and organisation memberships.
- Apply patches, rerun `scripts/verify.sh`.

## Quarterly

- Tabletop exercise and incident runbook review.
- Refresh this threat model and the control matrix.
- Check key rotation and vault passphrase custody.
- Refresh the manual pentest checklist.

## Annually

- Policy review, full restore, decision on an external review.

## KPIs

| KPI | Definition | Source |
|---|---|---|
| Mean time to detect | First event time to alert time | `security_events` to `alerts` |
| Mean time to acknowledge | Alert open to `state = acknowledged` | `alerts` |
| Mean time to resolve | Alert open to `state = resolved` | `alerts` |
| Triaged percentage | Resolved or acknowledged over all opened in period | `alerts` |
| Backup success | Sealed archives with matching checksum over attempts | backup log |
| Patch latency | Advisory date to deploy date | scan history |
| Chain integrity | Verify result per day | `verify-chain.mjs` |
| Failed logins | Denied `auth.login` per day | `audit_events` |
| Extraction bursts | `extraction_notice` alerts per hour | `alerts` |
| Heartbeat silence | Sources over 15 minutes | `security_heartbeats` |
