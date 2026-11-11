# Host baseline

Recorded 22 October 2026 on macOS 26.5, arm64, by `scripts/posture.sh`.
This is what the host reported, not what the build wishes it had.

| Check | Result | Detail |
| --- | --- | --- |
| FileVault | PASS | On |
| Application firewall | FAIL | Disabled at the time of the run |
| pf | UNKNOWN | Needs root to read; the anchor is supplied but not yet applied |
| Gatekeeper | INFO | Assessments enabled |
| Automatic updates | UNKNOWN | Not readable from the logged-in session |
| Guest account | PASS | Disabled |
| Screen lock | INFO | Immediate |
| Free disk | PASS | 19 GiB |

Listening sockets at the time of the run included `rapportd` on
`*:53637`, Control Center on `*:7000` and `*:5000`, a Python process on
`127.0.0.1:8787`, Postgres on `127.0.0.1:5432`, OpenCode on loopback,
and the two app servers on `*:8100` and `*:8200`. The app binding is the
finding this work closes first: both servers must listen on `127.0.0.1`
unless `HOST` is set on purpose.

## Manual steps required

These need an admin password and are not automated by the repo:

```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setstealthmode on
sudo bash scripts/pf-firewall.sh apply --yes
```

Automatic update checks and the screen lock delay should be confirmed in
System Settings. The report records UNKNOWN rather than guessing.

## Known gaps

- The application firewall was off during the baseline. Turn it on and
  re-run the script before claiming the PASS.
- `pf` rules are supplied and tested in print mode. They are not loaded
  until an admin applies them.
- The app servers were listening on all interfaces. Phase 3.1 changes
  the default to loopback and the bind test proves it.
- `osquery` is not installed because its package needs an admin
  approval. Host telemetry therefore rests on FIM plus audit until that
  approval lands.

## Re-run

```bash
bash scripts/posture.sh
```

Paste the new table here with the date whenever a host setting changes.

## Re-run, 22 October 2026 after the install

| Setting | State | Evidence |
|---|---|---|
| Application firewall | PASS | `socketfilterfw --getglobalstate`: enabled (State = 1) |
| pf anchor | PASS (applied) | `pfctl -a cyberserious -sr` shows block drop from the bad table, pass on lo0 for 8100, 8101, 8200, 8443, 8444, pass out |
| Gatekeeper | INFO | assessments enabled |
| Guest account | PASS | disabled |
| Screen lock | INFO | immediate |
| Listening services | PASS after rebind | regulator 8100 and organisation 8200 on 127.0.0.1; Postgres 5432 on 127.0.0.1 and ::1. Other listeners belong to macOS or the agent host |
| Free disk | PASS | 11 GiB |
| ClamAV | PASS | supervised daemon, local socket, EICAR detected |
| osquery | PASS with owner step | daemon active, inventory queries work; Full Disk Access still needs UI approval |
| Lynis | WARN | hardening index 75, 176 tests, 2 warnings, 16 suggestions |

The earlier gaps are closed for the firewall, pf, loopback binding and
osquery install. osquery endpoint events and system-keychain trust stay open
and are listed in `docs/security/CONTROL_EQUIVALENCE.md`.
