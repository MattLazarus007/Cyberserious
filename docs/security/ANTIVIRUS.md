# Antivirus

ClamAV runs as the logged-in user, on a unix socket with mode `600`, and
no TCP port. The lab does not ask it to be an EDR. It is a file scanner
with a current signature set and a reproducible detection test.

## State

| Item | Value |
| --- | --- |
| Engine | ClamAV 1.5.4 |
| Database | main 63, daily 28161, bytecode 339 |
| Signatures | 3,628,191 at the time of the test |
| Socket | `data/clamav/clamd.sock` |
| Config | `data/clamav/clamd.conf` (rendered, mode 600) |
| Logs | `data/clamav/clamd.log`, capped at 10 MB |
| Supervisor | `~/Library/LaunchAgents/com.cyberserious.clamd.plist` |
| Updates | `com.cyberserious.freshclam`, every six hours |

`Foreground true` is required under launchd. With `Foreground false`
clamd forks and launchd treats the parent exit as a crash, then starts a
second daemon that fights for the socket. The config says true and the
agent owns one process.

## Commands

```bash
bash scripts/clamav.sh setup          # render configs
bash scripts/clamav.sh update         # freshclam
bash scripts/clamav.sh agents         # install and start both agents
bash scripts/clamav.sh status
bash scripts/clamav.sh test           # writes EICAR to a temp file and scans it
bash scripts/clamav.sh scan <path>
bash scripts/clamav.sh stop
bash scripts/clamav.sh unagents
```

## Detection proof

Run on 22 October 2026:

```
/eicar...: Eicar-Test-Signature FOUND
EICAR detected as expected
```

The test writes the standard test string to a temporary file, scans it
through the daemon, and expects exit 1 with `FOUND`. The file is removed
on exit. The EICAR string is never stored in the repo.

## Limits

- Signature updates lag the vendor by hours. A new sample can pass.
- Archive scanning is bounded: 50 MB per file, 100 MB total scan, 25 MB
  stream. A larger upload is refused by the upload limit before it gets
  here.
- No on-access scanning. Files are scanned when the upload path calls
  the scanner, not when any process opens them.
- The database is user writable. Tampering is possible for an attacker
  with this account. The audit chain records evidence actions, not the
  scanner's own state. A production build pins the database and runs the
  daemon under a separate account.
