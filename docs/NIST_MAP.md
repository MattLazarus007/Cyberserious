# NIST CSF 2.0 mapping against the actual build

Restated from the plan against what runs today, not what was drawn.

**Govern.** Roles and approval policy live in code (policy.ts, the draft
lifecycle). Decisions sit in docs/adr. The risk register ties each risk
to a treatment and a test, while research findings carry confidence
labels so a weak claim cannot pose as a strong one.

**Identify.** Cases, notifications, versions, assets in scope and
affected counts form the inventory. Research cases map the local threat
picture from the group's own bibliography, source by source.

**Protect.** Scrypt passwords, server sessions, signed intake,
quarantined uploads, sealed research notes and the content policy on
every page. Administrators hold no case grants.

**Detect.** Five versioned rules evaluate on intake and import, with
reason codes and input hashes. Queue-age warnings watch the worker
itself. Snooze expiry sweeps run beside them.

**Respond.** Notes, transitions with conflict handling, assignments,
acknowledge, snooze and resolve, all audited with actor and time.
Runbooks cover restore and incidents, each with dated exercise evidence.

**Recover.** Nightly checksummed dumps and a timed restore rehearsal
with reconciliation. A lost acknowledgement never creates a second
case, because retries are idempotent.
