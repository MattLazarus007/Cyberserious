# Lab sensor runbook

## What the sensor does

The lab sensor watches the two application ports. It raises three kinds of
alert:

- a cleartext password field posted to an app port (SID 9000001)
- five failed sign-ins from one source inside thirty seconds (SID 9000002)
- three syn packets against the app ports inside thirty seconds (SID 9000003)

Suricata runs the rules. `scripts/sensor-shipper.mjs` carries the alerts to
`POST /api/v1/sensor/alerts` on the regulator under the `INTERNAL_TOKEN`
header. The inbox shows them as sensor alerts. A repeated event keeps one
row because the ingest path dedupes on the event key. A burst past the rate
limit answers 429 and the shipper counts it as refused. A refused post does
not stop the run.

## Files

- `infra/sensor/local.rules`: the three lab rules.
- `infra/sensor/suricata.yaml`: lab override, logs to `infra/sensor/out/`.
- `scripts/build-fixture-pcap.mjs`: builds the replay fixture with real
  checksums. It needs no package.
- `scripts/sensor-shipper.mjs`: parse and ship. The tests import the same
  functions the command line uses.
- `infra/sensor/out/`: logs and replay output. Gitignored.

## Replay the fixture (no root, proven path)

Run these commands from the repository root:

    node scripts/build-fixture-pcap.mjs /tmp/sensor-fixture.pcap
    suricata -c infra/sensor/suricata.yaml -S infra/sensor/local.rules \
      -r /tmp/sensor-fixture.pcap -l /tmp/sensor-replay
    grep '"event_type":"alert"' /tmp/sensor-replay/eve.json

Expected result: three alert lines with SIDs 9000001, 9000002 and 9000003.
T-60 in `docs/TEST_LOG.md` records this run.

## Live capture (needs root)

The kernel gives the BPF device to root only. A normal user gets
"permission denied" on `lo0`. The live run is a demonstration step, not a
test:

    sudo bash scripts/suricata.sh install

The launch daemon runs at boot and keeps the process alive. On this host the
kernel answers `ioctl: lo0: unable to set caps: Operation not supported on
socket`. The engine still starts. Stop it with
`sudo bash scripts/suricata.sh uninstall`. Suricata writes `eve.json` and
`suricata.log` under `infra/sensor/out/`; Vector watches that file.

A browser that opens several keep-alive connections can trip the syn rule
(SID 9000003). That is expected on `lo0`. Read the alert. Do not treat it
as an attack.

## Ship the alerts

Set the same secret in the regulator shell and the shipper shell:

    export INTERNAL_TOKEN=<lab value>
    node scripts/sensor-shipper.mjs --base http://localhost:8100

The command prints `shipped N of N alerts to ... (0 refused)`. The
regulator inbox shows the rows under Sensor alerts. `--eve <path>` reads
another eve file. The default is `infra/sensor/out/eve.json`.

## Wazuh: native arm64 manager, proven

The manager and the agent run natively on this Apple Silicon host. The 4.14.9
images carry arm64 manifests, so no emulation is involved. The earlier exit 139
came from an amd64-only tag under qemu.

`scripts/wazuh.sh start` starts the manager, writes the enrollment password to
`/var/ossec/etc/authd.pass`, starts the agent and waits for the syscheck scan.
`probe` writes a file under `/lab`. `alerts` copies `alerts.json` out of the
manager. `ship` posts each alert to the regulator sensor inbox.

Evidence, 9 November 2026:

- The manager answered on 1515 with `Using password specified on file`.
- The agent enrolled: `Agent key generated for 'lab-agent'`.
- The probe raised rule 554, `File added to the system`, for a file under `/lab`.
- The shipper stored the row in the regulator inbox as
  `Wazuh FIM: File added to the system.`
- The sensor route allows 60 posts a minute. A larger batch answers 429 for the
  rest. Ship a single alert file, or repeat after the window.

Limits: one manager and one agent on one host. No cluster and no indexer. The
agent watches `/etc`, `/usr/bin`, `/usr/sbin` and `/lab`. The regulator inbox is
the only destination; no live Wazuh dashboard is claimed.

The trip wire exempts a request that carries the internal token, so a sensor
batch cannot lock the service.

## Stop and clean up

    bash scripts/wazuh.sh stop
    rm -rf infra/sensor/out
