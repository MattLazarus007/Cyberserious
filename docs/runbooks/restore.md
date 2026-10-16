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

## TLS operator duty, not yet done

This step is not yet done and stays manual at the edge:

1. Provision certs at the reverse proxy or load balancer before
   exposing the lab beyond localhost.
2. Flip the Secure flag in apps/regulator/server/session.ts in
   sessionCookieHeader and clearCookieHeader.
3. Verify with `openssl s_client -connect <host>:443 -servername
   <host>` and confirm a valid chain plus a 200 over HTTPS.

Status: not yet done. The local lab stays plain HTTP until this lands.
