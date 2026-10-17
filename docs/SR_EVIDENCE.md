# Security requirements evidence, SR-01 to SR-10

Each requirement with what the build actually does and where the
proof lives. Limits are stated, not hidden.

**SR-01: transport and link protection.** The two lab systems can talk
to each other over mutual tls on localhost:8101.
scripts/gen-mtls-certs.sh builds a 4096 bit local authority, a server
certificate carrying localhost and 127.0.0.1 in its subject alternative
names, and an org client certificate with the clientAuth purpose.
Everything lands under certs/mtls/ and none of it enters version
control. apps/regulator/server/mtls.ts opens that listener only when
MTLS_PORT is set, asks for a client certificate, refuses a chain it
does not recognise, holds TLS 1.3 as the floor and mounts the same
express app as the plain port. Proof lives in
tests/integration/mtls.test.ts: a client with no certificate dies on
"tlsv13 alert certificate required", a certificate from a foreign
authority is refused, plain http to 8101 gets no answer, and a
registered certificate carries a signed payload to a 201 receipt while
the socket reports TLSv1.3. The switches are MTLS_PORT on the
regulator and MTLS=1 on tools/org-sender.ts, both off by default.
Every other hop in the lab still runs plain http on localhost:8100 and
8200, and no TLS is claimed for those. The compose file declares
service topology and network isolation only and holds no TLS stanza,
so the full-TLS story between containers stays declared, not
demonstrated. Image digests pin on first pull. Status: mutual tls
between the two lab systems demonstrated locally, wider transport
protection documented only.

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
