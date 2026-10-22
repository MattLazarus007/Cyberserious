# Install the stack

Purpose: rebuild the local security stack on a macOS host.
Prerequisites: Homebrew, Node 24, Postgres 16, Docker or Colima for ZAP, an
admin session for pf, the firewall and the CA trust, and 15 GiB free.

```bash
source scripts/env.sh
bash scripts/install-security-tools.sh --check
bash scripts/install-security-tools.sh --install
bash scripts/keychain.sh generate vault
bash scripts/vault.sh create
bash scripts/vault.sh mount
bash scripts/seal.sh init
bash scripts/clamav.sh install
bash scripts/pf-firewall.sh --print
sudo bash scripts/pf-firewall.sh apply --yes
bash scripts/caddy.sh run
```

Status: `bash scripts/clamav.sh status`, `bash scripts/osquery.sh status`,
`bash scripts/caddy.sh status`, `sudo bash scripts/pf-firewall.sh status`.
Logs: `data/logs/`, `data/clamav/`, `/var/log/cyberserious-pf.log`.
Verification: `bash scripts/verify.sh`.
Rollback: `sudo bash scripts/pf-firewall.sh flush --yes`, `caddy untrust`,
`launchctl bootout` the lab agents, `bash scripts/vault.sh unmount`.
Failure modes: no admin prompt means the step did not run; a missing socket
means clamd is not the supervised process; a 502 from Caddy means the app is
not on 127.0.0.1:8100.
