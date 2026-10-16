# Security requirements evidence, SR-01 to SR-10

Each requirement with what the build actually does and where the
proof lives. Limits are stated, not hidden.

**SR-01: transport and link protection.** Local lab runs plain HTTP
on localhost. No TLS is claimed. The compose file declares service
topology and network isolation only and holds no TLS stanza. Image
digests pin on first pull. mTLS stays unchecked Phase 12 work. Status:
documented, not yet demonstrated.

**SR-02: encrypted storage and backups.** Research notes use
aes-256-gcm envelopes with tamper tests green. Dumps are
checksummed nightly by scripts/backup.sh. Volume encryption belongs
to the host and is declared as an operator duty in the runbook.
Status: field evidence done, host encryption declared.

**SR-03: multi-factor sign-in.** Password plus console code, with
lockout, expiry and idle and absolute session limits, all tested.
Keycloak remains the full story in Phase 12. Status: lab story
complete, limits documented.

**SR-04: deny by default with scope.** Central gate, matrix tests
with negatives, cross-organisation denial across six surfaces
(T-08, T-10). Status: demonstrated.

**SR-05: attributable events.** Notes, transitions, assignments,
imports, alert actions, uploads, downloads, exports and intake all
write audit rows in their own transactions. Status: demonstrated,
verify endpoint included.

**SR-06: only the right holders approve and submit.** Steward cannot
approve, analyst cannot draft, organisation strangers cannot sign
in. Status: demonstrated in the T-15 suite.

**SR-07: submissions stay immutable.** No update path for versions.
Notes and transitions are separate case-work rows. Status:
demonstrated by T-27.

**SR-08: intake validation and control.** Schema validation, 256KB
bodies, sender registry, signature-before-parse, idempotency with
409 on conflict, per-name login rate cap. Status: demonstrated by
T-14 and T-16 to T-20.

**SR-09: backups with a real restore.** Nightly script, checksummed
dumps, timed rehearsal with matching counts in
docs/project/exercises/restore-2026-10-16.md. Status: demonstrated,
re-measured each run.

**SR-10: honest time handling.** Precision labels, unknown stays
unknown, internal timers labelled, no statutory countdown anywhere.
Status: demonstrated by T-24 and the RULE-02 wording tests.
