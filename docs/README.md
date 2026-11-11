# Documentation guide

I keep every document in this folder. This page tells you what each one answers and the order I would read them. If you are new, start with the brief. If you are reviewing the security work, start with the program and the control matrix.

## Start here

- `BRIEF.md` explains the law, both systems, the data and the questions a reviewer asks. Read this first.
- `GLOSSARY.md` defines the terms in plain words. Use it when a word feels heavy.
- [STATUS.md](../STATUS.md) states what works, what is partial and what is blocked. Read it before a demonstration.
- `PROGRESS.md` tells the story of the build and what remains.
- `TEST_LOG.md` holds every acceptance result, from T-01 to the current row. Each row names the place it ran.
- [CHANGELOG.md](../CHANGELOG.md) lists each change with its test and the machine it ran on.

## The system

- `SETUP.md` covers an empty machine, the toolchain, the four databases and the optional listeners.
- `DEMO.md` scripts the walkthrough across both systems.
- `TOOLBOX.md` lists the tools the lab uses and what each one proves.
- `D4_MAPPING.md` maps the build to the technology criteria of Deliverable 4.
- `RESEARCH_METHOD.md` and `SR_EVIDENCE.md` record the research method and the sources.
- `NIST_MAP.md` maps the controls to the NIST Cybersecurity Framework 2.0 functions.
- `RISKS.md` lists the risks, the owners and the treatment.

## Security

The `security/` folder holds the evidence pack. Read it in this order:

1. `SECURITY_PROGRAM.md` names the goal, the scope and the rules I followed.
2. `THREAT_MODEL.md` names the assets, the actors and the abuse cases.
3. `DATA_CLASSIFICATION.md` says what data exists and how each class is handled.
4. `CONTROL_EQUIVALENCE.md` maps each control to a command and an artefact.
5. `COMPLIANCE.md` maps the POPIA and ECTA duties to a control, a test and a gap.
6. `SCANS.md` and `VA_D5.md` record the vulnerability assessment and its findings.
7. `DAST_REPORT.md` records the dynamic scan.
8. `PENTEST.md` is the manual checklist. `PENTEST_REPORT.md` is the independent black-box pass.
9. `ANTIVIRUS.md`, `BACKUP.md`, `FILE_PERMISSIONS.md`, `NETWORK_EXPOSURE.md` and `HOST_BASELINE.md` cover the data and host controls.
10. `OPERATIONS.md` and `DEPLOYMENT_PROOF.md` show the service running and the evidence behind it.
11. `CI.md` explains the gates and how to read a failure.
12. `legal/SOURCES.md` lists the legal sources.

## Runbooks

The `runbooks/` folder holds the procedures I would follow at 2am. Each one names the trigger, the steps and the check that proves the step worked.

- `restore.md`, `backup` is covered in `security/BACKUP.md`.
- `incident.md`, `key-rotation.md`, `vault.md`.
- `caddy.md`, `firewall.md`, `ingress.md`, `network` note.
- `sensor.md`, `host-telemetry.md`, `monitoring.md`, `vuln-management.md`, `install-stack.md`.

## Decisions and project record

- `adr/` holds the architecture decisions, one file per decision. Each one names the choice, the reason and the cost.
- `project/tasks/` holds the phase plans and the task template.
- `project/exercises/` holds the incident, restore and tabletop records.
- `project/STYLE_LOG.md` records the wording changes on the report.

## Figures

- `figures/SOURCE.md` lists where each figure comes from and how to rebuild it.

## How I keep this folder honest

A document that claims a control must name the file, the command and the result. If a check cannot run, the document says so. If a row is a gap, the row says gap. I would rather read a short honest page than a long confident one.
