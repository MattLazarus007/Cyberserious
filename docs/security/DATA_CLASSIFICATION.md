# Data classification and handling

| Class | Examples | Storage | Handling |
|---|---|---|---|
| Restricted | Evidence files, sealed contact details, vault passphrase, session secrets | Encrypted evidence store, sealed columns, Keychain, vault | Need to know. No export without a manifest and audit row |
| Confidential | Case narrative, affected counts, organisation contacts, audit logs | Postgres, encrypted backups | Role scoped. No public sample with real data |
| Internal | Alerts, queue state, heartbeat, control status | Postgres and logs | Analysts, supervisors, audit and security roles |
| Public | Seeded synthetic demo records, documentation | Repository | Marked synthetic. Never mix with real data |

## Rules

- The seed data is synthetic. Do not load real breach data into the demo.
- Evidence downloads are logged and produce an extraction notice.
- Exports carry a marking and a manifest, not just rows.
- Backups are ciphertext only. Plaintext working directories are removed by trap.
- Logs do not contain passwords, OTP codes, tokens or full contact details.
- Retention: security events follow `SECURITY_EVENT_DAYS`; case retention follows the case policy. Deletion is audited.
