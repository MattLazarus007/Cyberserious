# Vault runbook

The evidence and backup volume is an encrypted APFS sparse bundle. It
lives at `data/CyberVault.sparsebundle` and mounts at `data/vault`. The
passphrase is generated once and stored in the login keychain under the
service item `cyberserious.vault`. It is never written to the repo, to
`.env`, or to shell history.

## Create once

```bash
bash scripts/vault.sh create
bash scripts/vault.sh mount
bash scripts/vault.sh status
```

`create` refuses when the bundle already exists or when the keychain
item is present, so it cannot silently replace a passphrase. `status`
must report `image-encrypted : TRUE`. The inner APFS volume reports no
encryption because the encryption sits on the disk image, so hdiutil is
the correct source, not `diskutil info`.

## Daily use

```bash
bash scripts/vault.sh mount
export EVIDENCE_DIR="$PWD/data/vault/evidence"
export BACKUP_ROOT="$PWD/data/vault/backups"
bash scripts/vault.sh unmount
```

The mount script creates `evidence` and `backups` with mode `700` and
sets the mount root to `700`. Unmount before shutting the machine down
so the image is closed cleanly.

## Key custody

The passphrase is protected by FileVault and the login keychain. An
attacker with the unlocked user session can read it. That is the threat
model, stated plainly. A production build would move this to a secrets
manager or a hardware token and would not keep the recovery key on the
same host.

## Failure modes

- `no vault at ...`: run `create`.
- `Authentication error`: the keychain item and the image passphrase
  have drifted. Stop. Do not delete either until the owner decides
  which one to recover.
- `already mounted`: no action needed.
- `not mounted` from status: expected when the vault is closed.

## Verify

```bash
hdiutil info | grep image-encrypted
```

Expected `image-encrypted : TRUE` for the CyberVault image.
