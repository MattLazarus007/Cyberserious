# Change log

This list covers the November pass, which I ran. The dashboard, the interface
and the earlier build belong to the team, and README.md names the maintainers. Each entry
names the change and the check that proves it. Test ids refer to
`docs/TEST_LOG.md`.

## 9 November 2026

### The plan items, on the host and in Docker

- I closed the security stack plan, items S4.1 to S4.6. Added `docs/security/CI.md`,
  the coverage floor of 90, `scripts/drill-trip.sh`, a drill record, a tabletop
  note and a demo security pass. Tests T-128 to T-145.
- I ran the trip drill against the Docker lab and recorded the real output in
  `docs/project/exercises/incident-2026-11-09.md`.

### The trip wire and the machine channel

- The trip wire has two stages now. A burst answers 429 and writes a medium
  warning. A second burst locks the service, revokes sessions and writes the
  high alert. Signed intake traffic counts. T-128, T-129.
- A request that carries the internal token no longer counts toward the wire, so
  a sensor batch cannot lock the service. T-145.
- The signed intake body has a 256 KB cap and answers 413 above it. T-130.

### Data integrity, in the test runner

- Note idempotency keys are scoped to one case and one author. T-131.
- Case and draft numbers come from sequences. Parallel creates cannot
  collide. T-132.
- Standing correlation alerts keep one row per subject. This closed 4,129
  duplicate sensor alerts in the dev database. T-139.

### Access and errors, in the test runner

- Alert reads follow case assignment for analysts. T-133.
- A user with more than one membership acts under the least privileged role.
  T-147.
- A malformed evidence id answers 404 instead of a database error. T-148.
- A negative ban window falls back to the default hour, capped at 30 days.
  T-149.
- A text receipt from the intake no longer strands a draft. T-150.
- A bad limit value falls back to the default. T-151.
- A multi-audience token must name this client in `azp`. T-152.
- The login path equalises timing for an unknown username. The failure map is
  bounded.
- The database pool has an error listener. An idle client error cannot crash
  the process. T-146.

### Wazuh, on the host

- Wazuh 4.14.9 runs natively on arm64. One manager and one agent enroll with a
  password file. A probe under `/lab` raised rule 554 and the row reached the
  regulator inbox. The launch script accepts a registered agent as enrolled.
  T-141, T-142.

### Keycloak, in the container

- The realm carries a TOTP policy. The user `mfa1` must complete Mobile
  Authenticator setup before any client signs it in. T-143.

### osquery, on the host

- The host inventory runs as two LaunchAgents. The daemon collects every five
  minutes and the heartbeat posts every fifteen. T-144.

### Docker

- I added a Dockerfile, a rewritten compose file, an org database init script, a
  shared sender key volume and six static checks. T-135.
- The stack builds and serves both apps. A real sign-in reads 7 cases and 11
  alerts. T-136, T-137.
- The host portal now exports `ORG_SENDER_KEY` in its run script. Without it the
  send route answered 502.

### Live acceptance

- 36 checks pass on the host pair and 36 on the Docker pair. The checks cover
  sign-in, case work, alerts, the chain, bans, evidence review and download, the
  portal send and the affected notice. T-154, T-155.
- Both dashboards render with 7 notifications and no client errors. T-156.

### Documentation

- README, STATUS, PROGRESS, BRIEF, SETUP, DEMO, D4_MAPPING, the control matrix,
  the sensor runbook, the restore runbook and the deployment proof now match the
  running system.
- I added this file.

## 28 October 2026

- The vulnerability assessment and the compliance testing tranche. T-119 to
  T-127.
- The two edges moved to TLS 1.3 and the session cookie follows the transport.

## 22 October 2026

- The security stack: WAF, bans, chained security events, correlation, anchors,
  export caps, retention, launchd supervision and the security console.
