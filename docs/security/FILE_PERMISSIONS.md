# File permissions

The lab runs as one user, so file modes are the last line of defence
between case data and anything else on the machine.

| Path | Mode | Why |
| --- | --- | --- |
| `data/` | `700` | holds the vault, logs, and local state |
| `data/vault` | `700` | mounted encrypted volume root |
| `data/vault/evidence` | `700` | sealed evidence files |
| `data/vault/backups` | `700` | encrypted backups |
| `data/logs` | `700` | service and security logs |
| `certs/` and key files | `600` | private keys and certificates |
| `certs/mtls/` | `700` | directory holding private keys |
| `scripts/env.sh` | `644` | contains no secrets, only defaults |
| `apps/*/web/**` | `644` | public assets only |

`scripts/env.sh` sets `umask 077` so new files start private. Do not
relax it for convenience. A production build runs the service under a
dedicated account with the same modes and a separate group for log
readers.

## Check

```bash
source scripts/env.sh && umask
find data certs -maxdepth 2 -perm -o+r -print 2>/dev/null
```

Expected `0077` and no world readable paths under `data` or `certs`.
