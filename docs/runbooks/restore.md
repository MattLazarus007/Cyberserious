# Restore runbook

This page tells the group how to bring the system back from a backup.
It is written for the lab machine, where Postgres 16 runs as a local
service and both applications run from this repository.

## What a backup holds

Each dated folder under data/backups keeps two database dumps, a
tarball of the evidence directory and a SHA256SUMS file. The keys for
sealed research notes live outside the backup, in the shell that runs
the applications. Without the research key, sealed notes stay sealed.

## Restore steps

1. Check the checksums first: `cd data/backups/2026-10-16 && shasum -c SHA256SUMS`.
2. Create a scratch database: `psql -d postgres -c "create database cyberserious_restore owner cyberserious;"`.
3. Load the regulator dump: `pg_restore -d cyberserious_restore regulator.dump`.
4. Reconcile: compare case, notification, alert and audit row counts
   against the numbers in the restore report. Verify the audit chain
   through GET /api/v1/audit/verify.
5. Unpack evidence beside the restored files and compare one sha256
   by hand.
6. Drop the scratch database when the exercise is done.

## Recovery targets from the 16 October rehearsal

Recovery point: the nightly dump, so at most one day of lab work.
Recovery time: about a minute at this data size, measured during the
rehearsal. The full numbers sit in
docs/project/exercises/restore-2026-10-16.md.
