# CyberSerious glossary

Short definitions for the words the project uses in a fixed sense.
Everyone in the group should mean the same thing by each of them.

**Case.** The regulator's work record for one suspected breach. It
carries a reference like BR-2026-0001, a state, a severity and a
priority. Analysts add notes and transitions to it.

**Notification.** A communication from an organisation about an
incident. One case can receive several notifications over its life.

**Notification version.** One immutable revision of a notification.
New information arrives as a new version linked to its predecessor.
Old versions are never edited.

**Alert.** A pointer that says a case deserves attention, raised by a
named rule with a reason. Alerts are separate records from case
states. Closing an alert never closes its case.

**Signal.** An unverified report that has not become a notification
yet. The seeded case BR-2026-0007 is a signal. It has no notification
row.

**Finding.** A recorded human judgement, such as a review outcome. The
system stores findings. It never computes legal verdicts from dates.

**Receipt.** The signed answer the intake endpoint returns after
storing a submission. A retried submission with the same identity
gets the original receipt back.

**Idempotency key.** A value the sender attaches so a retry is
recognised. Same key with the same bytes returns the stored receipt.
Same key with different bytes is rejected and logged.

**Outbox job.** A row describing work the background worker still has
to do, such as evaluating the alert rules for a new version.

**Audit chain.** The append-only log where every mutation leaves a
row. Each row hashes the one before it, so tampering breaks the
chain at exactly the altered point.

**Dedupe key.** The identity a rule uses to recognise it has seen an
input before. Matching inputs refresh the existing alert instead of
opening a duplicate.
