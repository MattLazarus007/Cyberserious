# Security program

The lab protects one thing well: a POPIA breach register with evidence,
notifications and an audit trail. The program is sized to that, not to a bank.

## Objectives

1. Only authorised people read or change a case.
2. Every change is attributable and tamper evident.
3. Malware and hostile input do not enter the evidence store.
4. Loss of the laptop does not expose the register or its backups.
5. An operator can see whether each control is alive.
6. A reviewer can rebuild and verify the result from this repository.

## Control families

| Family | Controls |
|---|---|
| Governance | Threat model, data classification, risk register, incident runbook, operations cadence |
| Identity | Keycloak OIDC, password policy, per-session OTP, roles, session revocation |
| Endpoint | Application firewall, pf, ClamAV, osquery inventory, FileVault, screen lock |
| Network | Loopback binding, TLS edge, mTLS intake, pf default deny |
| Application | Origin guard, WAF, rate limits, CSP, header policy, input validation, output as text |
| Data | AES-GCM evidence, encrypted vault, age-sealed backups, retention, export manifests |
| Detection | Suricata, security event chain, correlation rules, heartbeats, trip wire |
| Assurance | Unit, integration and browser tests, SAST, SCA, secrets scan, DAST, Lynis |
| Response | Severity runbook, containment drill, tabletop, restore rehearsal |

## Trust boundaries

Browser to Caddy on 8443. Caddy to the regulator on loopback. Regulator to
Postgres on loopback. Sensor and collector to the ingest API with a shared
token. Organisation app to regulator intake with a signed event. Owner to the
host with an admin prompt. Each boundary has one control that is tested.

## Ownership

The owner is the only administrator. Root actions are explicit prompts. The
lab has no 24/7 staff, so detection is a page and a cadence, not a SOC shift.
