# Firewall runbook

Two layers run on the host: the macOS application firewall and a `pf`
anchor named `cyberserious`. The anchor is the one that carries the
loopback-only rule set.

## Install and apply

```bash
bash scripts/pf-firewall.sh --print
sudo bash scripts/pf-firewall.sh apply --yes
sudo bash scripts/pf-firewall.sh status
```

`apply` needs local access. Applying over SSH can lock you out, which is
why it refuses without `--yes`. It backs up `/etc/pf.conf` before adding
the two anchor lines, installs the anchor with mode `600`, loads it, and
installs the LaunchDaemon so the rules return after a reboot.

## Rules

- Default drop inbound on every interface other than loopback.
- Pass loopback on 8100, 8101, 8200, and 8443 only.
- Allow outbound and established traffic.
- Keep a `cyberserious_bad` table for confirmed hostile addresses.

## Ban and unban

```bash
sudo bash scripts/pf-firewall.sh ban 203.0.113.9
sudo bash scripts/pf-firewall.sh unban 203.0.113.9
```

The application ban list is the first response. The pf table is for an
address that keeps returning after the application ban expires. Record
every manual ban in the incident log.

## Verification

```bash
sudo pfctl -a cyberserious -sr
curl -sS --max-time 2 http://<lan-ip>:8100/ || echo "refused as expected"
curl -sS --max-time 2 http://127.0.0.1:8100/health/live
```

The first curl must fail from another host. The second must answer.

## Rollback

```bash
sudo bash scripts/pf-firewall.sh flush --yes
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate off
```

The `/etc/pf.conf` anchor lines remain after a flush. Remove them by hand
if the anchor is being retired, and keep the timestamped backup.
