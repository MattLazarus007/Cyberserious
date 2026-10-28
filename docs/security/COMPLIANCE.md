# Compliance and regulatory testing: section 2.7 evidence

Scope: the CyberSerious regulator application and the organisation portal.
This file maps each obligation to a control, a test or a command, and an
artefact. A row with no artefact is a Gap, not a pass.

Sources for every clause: `docs/security/legal/SOURCES.md`.

## 1. Method

1. Read the clause in the Act. Quote it into `docs/security/legal/`.
2. Identify the control in this build that answers the clause.
3. Name the test or the command that proves the control runs.
4. Run it and record the result.
5. Write the verdict. Where the control is missing, write Gap and name the
   compensating control.

The verdict vocabulary is fixed:

- Met. A test proves the control.
- Met, with a limit. The control exists and the limit is stated in the row.
- Gap. The control is missing. The row names the compensating control.
- Not applicable. The clause does not reach this system, and the reason is in
  the row.

## 2. POPIA 4 of 2013

| ID | Obligation | Control in this build | Test or command | Evidence | Verdict |
|---|---|---|---|---|---|
| P-01 | s19(1): secure the integrity and confidentiality of personal information | scrypt passwords, per-session OTP, role by action matrix, AES-256-GCM evidence at rest, loopback binding, TLS edge, age-sealed backups, hash-chained audit | `tests/unit/policy.test.ts`, `tests/integration/auth.test.ts`, `tests/integration/encrypt` (`tests/unit/encrypt.test.ts`), `tests/integration/evidence-sealed.test.ts`, `tests/integration/bind.test.ts` | `docs/security/VA_D5.md`, `docs/security/CONTROL_EQUIVALENCE.md` | Met |
| P-02 | s19(2)(c): regularly verify that the safeguards work | `scripts/verify.sh` runs eight gates, the audit chain verifier and the anchor verifier run on a schedule | `bash scripts/verify.sh`, `node scripts/verify-chain.mjs`, `node scripts/anchor.mjs --verify` | `docs/TEST_LOG.md` gate record | Met |
| P-03 | s19(2)(d): update safeguards in response to new risks | dependency gate, `overrides` for a known advisory, patch register | `bash scripts/security-scan.sh deps` | `docs/security/scans/finding-F01.txt` | Met |
| P-04 | s22(1)(a): notify the Regulator after a compromise | the organisation app submits a signed draft to the regulator intake; the regulator stores the case and a receipt | `tests/integration/intake.test.ts` (T-16 to T-20) | `docs/TEST_LOG.md` T-16 to T-20 | Met |
| P-05 | s22(1)(b): notify the data subject | the information officer runs a notice against the recipient register; the regulator records the count and raises a shortfall alert | `tests/integration/org-notify.test.ts` (T-68 to T-75), `tests/integration/affected-notices.test.ts` (T-71 to T-74) | `docs/TEST_LOG.md` T-68 to T-76 | Met |
| P-06 | s22(2): notify as soon as reasonably possible | both sides stamp the compromise, the approval and the dispatch; a rule flags a gap over 72 hours as an internal target | `apps/regulator/server/rules/index.ts` line 58 and line 95 | `tests/integration/alerts.test.ts` | Met, with a limit. The 72 hour figure is an internal target, not a statutory deadline. The Act sets no fixed hour |
| P-07 | s22(3): delay only when a public body or the Regulator directs | none. The system cannot hold a notice back on a lawful direction | no test | this row | Gap. The officer can withhold approval and record the reason as a case note, so a lawful delay is possible but not enforced by the system |
| P-08 | s22(4): notify in writing by post, e-mail, website notice, news media or as directed | a channel field with `letter`, `email`, `website`, `news`, plus `sms` and `phone` for a direction under s22(4)(e) | `tests/integration/compliance.test.ts` C-03 | `tests/integration/compliance.test.ts` | Met |
| P-09 | s22(5)(a): describe the possible consequences | the notice body carries the officer's consequence text | C-01 | `tests/integration/compliance.test.ts` | Met |
| P-10 | s22(5)(b): describe the measures taken or intended | the notice body carries the officer's measures text | C-01 | `tests/integration/compliance.test.ts` | Met |
| P-11 | s22(5)(c): recommend what the data subject should do | the notice body carries the officer's advice text | C-01 | `tests/integration/compliance.test.ts` | Met |
| P-12 | s22(5)(d): name the unauthorised person if known | the notice body carries the identity when it is known and states plainly when it is not | C-01 asserts the unknown branch | `tests/integration/compliance.test.ts` | Met |
| P-13 | s22(6): publicise on a Regulator direction | no publication register | no test | this row | Gap. The `news` channel lets the officer place a notice in the media, which is the substance of the direction. No record ties the direction to the publication |
| P-14 | s14: do not keep records longer than necessary | the retention sweep removes expired sessions, resolved alerts and terminal jobs; chained audit rows are counted, never deleted | `tests/integration/retention.test.ts` (T-111, T-112) | `docs/TEST_LOG.md` T-111 and T-112 | Met, with a limit. Audit and security rows are kept because deleting a row breaks the hash chain. That is retention for proof, which s14(1)(b) allows |
| P-15 | s17: document all processing operations | the brief, the ADRs, the threat model, the data classification and the test log | `docs/BRIEF.md`, `docs/adr/`, `docs/security/THREAT_MODEL.md`, `docs/TEST_LOG.md` | this repository | Met |
| P-16 | s18: tell the data subject when collecting personal information | the recipient register holds contact references, not data-subject details. The portal does not collect personal information from a data subject | `tests/integration/org-notify.test.ts` T-75 refuses a claim above the register size | this row | Not applicable. The system receives breach reports about data subjects. It does not collect from the data subject |

### Gaps in POPIA, stated plainly

P-07 and P-13 are open. Neither one blocks the two duties in s22 from working.
Both are limits of this build, not of the Act.

## 3. ECTA 25 of 2002

| ID | Obligation | Control in this build | Test or command | Evidence | Verdict |
|---|---|---|---|---|---|
| E-01 | s50(1): the personal information chapter applies to information obtained through electronic transactions | breach reports arrive through a signed electronic intake | `tests/integration/intake.test.ts` | `docs/TEST_LOG.md` T-16 to T-20 | Met. The chapter's scope test is answered |
| E-02 | s51: principles for collecting personal information electronically, including a record of the information and the purpose, kept for at least one year after use | POPIA supplies the lawful basis; the audit chain records actor, action, resource and purpose for every operation; the retention window exceeds one year | `tests/integration/cases.test.ts`, `tests/integration/retention.test.ts` | `docs/TEST_LOG.md` T-30, T-31, T-111 | Met, with a limit. This project relies on POPIA as the governing instrument and records no separate ECTA consent |
| E-03 | ss52 to 58: protection of critical databases | none, and none is required | `docs/security/legal/ecta-extracts.txt` | this row | Not applicable. s52 limits the chapter to a database the Minister declares critical under s53. No declaration covers this system |
| E-04 | s13: signature requirements | the intake body carries a JWS signature over a canonical body, with a sender key registered to an organisation | `tests/integration/intake.test.ts` (T-16 to T-20) | `docs/TEST_LOG.md` T-16 to T-20 | Met for the s13(3) test, not for s13(1). The signature identifies the sender and binds the body. It is an integrity control, not an advanced electronic signature |

## 4. PCI DSS

| ID | Obligation | Control in this build | Test or command | Evidence | Verdict |
|---|---|---|---|---|---|
| X-01 | The standard applies to cardholder data environments | none. No card, PAN, CVV or expiry element exists in the schema, the code or either interface | `grep -rniE "\b(card\|pan\|cvv\|cvc\|expiry\|visa\|mastercard\|payment)\b" --include=*.ts --include=*.sql apps db packages` | `docs/security/legal/pci-scope.txt` | Not applicable |

## 5. Evidence a reviewer can check

| Item | Path |
|---|---|
| Section 22 text, verbatim | `docs/security/legal/popia-extracts.txt` |
| ECTA text, verbatim fragments | `docs/security/legal/ecta-extracts.txt` |
| PCI scope test | `docs/security/legal/pci-scope.txt` |
| Source index | `docs/security/legal/SOURCES.md` |
| Notice construction | `apps/organisation/server/drafts.ts`, `noticeBody` |
| Channel constraint | `db/org-migrations/003_notice_channel_scope.sql` |
| Compliance tests | `tests/integration/compliance.test.ts` |
| Retained test rows | `docs/TEST_LOG.md` T-16 to T-20, T-30, T-31, T-68 to T-76, T-111 to T-118 |
| Control map | `docs/security/CONTROL_EQUIVALENCE.md` |

## 6. Conclusions

Both operative duties in POPIA section 22 run in this build and carry a test.
The Regulator path is signed and confirmed. The data-subject path carries the
four particulars that section 22(5) requires, and refuses a notice that misses
one.

Four obligations are not met and all four are stated: the lawful delay of
s22(3), the publication record of s22(6), and the two ECTA limits that this
build does not claim.

PCI DSS does not apply. The scope test finds no cardholder data element.

One defect was found by writing these tests rather than by reading the code.
The notice body was a placeholder and carried none of the four particulars.
The test C-01 failed before the fix and passes after it. That is the value of
testing a legal requirement instead of describing one.
