# Key rotation

Keys: vault passphrase, backup age identity, evidence key, research key,
internal collector token, session secret, mTLS certificates.

1. Record the reason and the time in the ops log.
2. Generate the new value in the Keychain, never in a shell history.
3. Re-seal data that depends on it before deleting the old key. Evidence
   rotation needs a re-encrypt pass with the old key still loaded.
4. Restart the services that read the key. Old sessions are revoked.
5. Verify: unseal one backup, read one evidence file, ingest one event.
6. Destroy the old key after the restore window, and record the destruction.

The vault passphrase rotation needs a new sparsebundle and a copy, not an
in-place edit. Schedule it with a restore rehearsal.
