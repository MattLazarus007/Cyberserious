# Host telemetry with osquery

Purpose: inventory listening ports, users and startup items without a
commercial EDR agent.

```bash
bash scripts/osquery.sh config
bash scripts/osquery.sh status
bash scripts/osquery.sh query "select * from listening_ports;"
sudo launchctl bootstrap system /var/osquery/io.osquery.agent.plist
```

Config: `infra/osquery/osquery.conf`. The stock daemon uses `/var/osquery`.
Logs: `/var/log/osquery/`. Verification: a query returns rows and the agent
shows as loaded.
Owner step: grant Full Disk Access to osquery in System Settings, Privacy and
Security. EndpointSecurity events stay off until that approval. Without it,
inventory still works and the gap is recorded in the control matrix.
Rollback: `sudo launchctl bootout system /var/osquery/io.osquery.agent.plist`.
