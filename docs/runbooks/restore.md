# Restore runbook

This page tells the group how to bring the system back from a backup.
It is written for the lab machine, where Postgres 16 runs as a local
service and both applications run from this repository.

## What a backup holds

One age sealed file per run, named `cyberserious-<UTC>.tar.gz.age`, and
its `.sha256`. Inside the sealed bundle: `regulator.dump`,
`organisation.dump`, and `evidence.tar.gz` when the evidence directory
exists. Archives go to `data/vault/backups` when the vault is mounted
and to `data/backups` otherwise. The age identity lives in the keychain
under `cyberserious.backup-key`; the recipient is `data/backup.pub`.

## Restore steps

1. Check the checksum from the folder holding the archive:
   `shasum -a 256 -c cyberserious-2026-10-22T093547Z.tar.gz.age.sha256`.
2. Unseal into a scratch directory:
   `bash scripts/seal.sh unseal <archive> /tmp/bundle.tar.gz`.
3. Unpack: `tar -xzf /tmp/bundle.tar.gz -C /tmp/restore`.
4. Create a scratch database:
   `createdb cyberserious_restore`.
5. Load the regulator dump:
   `pg_restore -d cyberserious_restore /tmp/restore/regulator.dump`.
6. Reconcile: compare case, notification, alert and audit row counts
   against the numbers in the restore report. Verify the audit chain
   through GET /api/v1/audit/verify after pointing the app at the
   scratch database.
7. Unpack `evidence.tar.gz` and compare one sha256 by hand.
8. Drop the scratch database and remove the scratch directory when the
   exercise is done. `rm -rf` the unsealed bundle too.

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

Status: the host deployment already serves both apps behind a Caddy TLS 1.3
edge, and the session cookie carries Secure there. An externally issued
certificate and a load balancer remain a deployment step for another host.
