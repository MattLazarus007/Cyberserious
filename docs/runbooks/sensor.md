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
limit answers 429 and the shipper counts it as refused. The run never dies.

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

    sudo suricata -c infra/sensor/suricata.yaml -S infra/sensor/local.rules \
      -i lo0 -l infra/sensor/out

Stop it with Ctrl C. Suricata writes `eve.json` and `suricata.log` under
`infra/sensor/out/`.

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

## Wazuh: what runs and what does not

The Wazuh ingest path exists and is tested from a saved file. The manager
does not run on this machine.

`scripts/wazuh.sh` starts `wazuh/wazuh-manager:4.14.9` and
`wazuh/wazuh-agent:4.14.9` for `linux/amd64`. The host is arm64 and the
Docker engine is arm64. The images therefore run under emulation.

On an arm64 host the script refuses the start actions with exit 2 and
names this gap. `WAZUH_ALLOW_EMULATION=1` overrides the refusal for a
trial. `status` still reads the stopped containers.

Evidence from 2026-10-19:

    docker inspect wz-manager --format 'exit={{.State.ExitCode}} oom={{.State.OOMKilled}}'
    exit=139 oom=false
    started=2026-10-19T09:53:55.183Z finished=2026-10-19T09:53:55.281Z

The container lived 98 ms and wrote nothing to `docker logs`. An earlier
attempt with a host bind mount into `/wazuh-config-mount` failed with s6
"child crashed with signal 11". The emulated manager binary dies before it
reaches its entry point.

What this means:

- The delivered sensor is Suricata. The replay path is proven.
- The Wazuh parser maps a saved `alerts.json` to sensor payloads. T-64 and
  T-67 cover that mapping.
- No live Wazuh manager, agent enrollment or FIM alert is claimed.
- To close the gap, run the manager on a linux/amd64 host. Then run
  `bash scripts/wazuh.sh start`, `bash scripts/wazuh.sh probe`,
  `bash scripts/wazuh.sh alerts` and `bash scripts/wazuh.sh ship`.

## Stop and clean up

    bash scripts/wazuh.sh stop
    rm -rf infra/sensor/out
