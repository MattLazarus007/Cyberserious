# Install the stack

Purpose: rebuild the local security stack on a macOS host.
Prerequisites: Homebrew, Node 24, Postgres 16, Docker or Colima for ZAP, an
admin session for pf, the firewall and the CA trust, and 15 GiB free.

```bash
source scripts/env.sh
bash scripts/install-security-tools.sh --check
bash scripts/install-security-tools.sh --install
bash scripts/keychain.sh generate internal-token
bash scripts/keychain.sh generate vault
bash scripts/vault.sh create
bash scripts/vault.sh mount
bash scripts/seal.sh init
bash scripts/clamav.sh install
bash scripts/pf-firewall.sh --print
sudo bash scripts/pf-firewall.sh apply --yes
bash scripts/regulator.sh install
bash scripts/organisation.sh install
bash scripts/caddy.sh install
bash scripts/vector.sh install
bash scripts/worker.sh install
sudo bash scripts/suricata.sh install
```

The Suricata line needs an admin session. The user agents start at login;
the Suricata daemon starts at boot. `INTERNAL_TOKEN` comes from the Keychain
item `internal-token`; Vector needs it to post to the ingest route.

Status: `bash scripts/clamav.sh status`, `bash scripts/osquery.sh status`,
`bash scripts/caddy.sh status`, `bash scripts/vector.sh status`,
`bash scripts/worker.sh status`, `bash scripts/suricata.sh status`,
`bash scripts/regulator.sh status`, `bash scripts/organisation.sh status`,
`sudo bash scripts/pf-firewall.sh status`.
Logs: `data/logs/`, `data/clamav/`, `/var/log/cyberserious-pf.log`.
Verification: `bash scripts/verify.sh`.
Rollback: `sudo bash scripts/pf-firewall.sh flush --yes`, `caddy untrust`,
`bash scripts/caddy.sh uninstall`, `bash scripts/vector.sh uninstall`,
`bash scripts/worker.sh uninstall`, `bash scripts/regulator.sh uninstall`,
`bash scripts/organisation.sh uninstall`, `sudo bash scripts/suricata.sh uninstall`,
`bash scripts/vault.sh unmount`.
Failure modes: no admin prompt means the step did not run; a missing socket
means clamd is not the supervised process; a 502 from Caddy means the app is
not on 127.0.0.1:8100.
