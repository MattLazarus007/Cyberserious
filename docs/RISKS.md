# Risk register

Each risk pairs with its treatment in this build and the test that
proves the treatment works. Where the treatment lands in a later
phase, the entry says so instead of claiming what is not there.

## Access and identity

**R-01: cross-organisation reads expose confidential reports.**
Every protected route checks role and organisation scope. Missing or
foreign records answer 404, never 403 with a hint. Proven by the
anti-enumeration tests T-04 and the administrator denial T-10.

**R-02: a stolen session lets an attacker act as a reviewer.**
Sessions expire after fifteen idle minutes and eight hours absolute.
The second factor is a console code with three attempts and a five
minute life. Proven by the lapse, lockout and expiry tests in the
sign-in suite. Managed identity sign-in waits in Phase 12.

**R-10: concurrent edits overwrite another analyst's decision.**
Transitions carry the version read. A stale writer gets a 409 with
both numbers. Proven by T-07.

## Evidence integrity

**R-04: forged, replayed or duplicate reports contaminate evidence.**
Manual capture is permission-gated with provenance on every row.
Versions are append-only with predecessor links. Signed intake with
sender verification and idempotency claims arrives in Phase 8, where
the lost-acknowledgement rehearsal T-20 proves it.

**R-05: an administrator rewrites evidence or audit history.**
Administrators hold no case grants at all. Notification versions have
no update path in code. Audit rows chain by hash with a verify
endpoint. Proven by T-10, T-27 and the chain verification behind the
audit tests.

**R-07: a malicious attachment compromises staff machines.**
Uploads do not exist yet, which is itself the current control: there
is no path for a hostile file. Quarantine with allowlist, size cap
and private storage arrives in Phase 9 with test T-28.

## Honest reporting

**R-03: untrusted text executes script in a browser.**
All record data renders through text nodes. No interpolation into
markup anywhere in the served scripts. Proven by the zero-hit markup
check on every page script and the textContent rule from Phase 1.

**R-06: a missing feed or bad date becomes a false finding.**
Dates carry precision labels and unknown stays unknown. The system
stores elapsed time and review findings, never a computed verdict.
Proven by T-24 with the unknown-date fixture and the RULE-04 tests.

**R-14: synthetic records get mistaken for official evidence.**
Fixtures use invented organisations and test receipts are labelled.
The page banner was removed at the owner's request in October 2026,
so this risk now rests on fixture naming, receipt labels and the
research register separation. Proven by the NAME_MAP fixture audit.

## Operations

**R-08: ransomware, error or a lost key destroys recoverability.**
Encrypted nightly dumps with a timed restore rehearsal arrive in
Phase 10 with test T-33. Research notes use sealed envelopes today,
proven by the tamper tests behind SR-02.

**R-09: spikes, heavy queries or big uploads deny access.**
Bodies are capped, lists are paginated at fifty, and the rules run
in a separate worker behind leased jobs. Proven by the page-size cap
tests and the lease-expiry recovery test T-25.

**R-11: exports or logs disclose report details.**
No export path exists yet. Audit rows carry references and outcomes,
never note bodies. Scoped audited export arrives in Phase 9 with
test T-29.

**R-12: a vulnerable dependency reaches the build.**
Three runtime dependencies are pinned in the lockfile: express, pg
and zod. Scanning and the lab deployment review arrive in Phase 10.

**R-13: fetching external data invites hostile content.**
The build fetches nothing external. Sources are curated by hand into
the research register. Any later fetcher gets destination controls
before it ships.
