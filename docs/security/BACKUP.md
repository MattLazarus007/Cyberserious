# Backup and restore

Backups are sealed before they leave the process. The archive on disk is
age ciphertext, so a stolen file is not a stolen case database.

## Proven on 22 October 2026

- Backup written to the mounted vault:
  `cyberserious-2026-10-22T093547Z.tar.gz.age` (48 KB).
- SHA256 `aba49bdc...6dbd25`, verified with `shasum -c`.
- Unsealed, unpacked, and checked: the bundle held
  `regulator.dump`, `organisation.dump`, and `evidence.tar.gz`.
- Restored the regulator dump into a scratch database: 7 cases and
  6 audit rows matched the source. Scratch database dropped.

## Key custody

`bash scripts/seal.sh init` creates an age identity, stores it in the
keychain as `cyberserious.backup-key`, and writes the recipient to
`data/backup.pub`. The identity never touches the repo. Losing the
keychain item makes every sealed backup unreadable. That is the point,
and it is also the operational risk: the key needs its own escrow
before this leaves the lab.

## Limits

- The backup is a point in time. The worker and uploads keep writing,
  so a restore loses whatever arrived after the dump.
- The script does not schedule itself. Run it from cron or a launch
  agent and keep the vault mounted for the run.
- Restoring returns data, not identity. Sessions, keychain items, and
  TLS material are outside the bundle.
- A restore that passes row counts still needs the audit chain check
  through the API before it can be called verified.
