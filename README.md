# CyberSerious

A working breach notification and case management system for Section 22 of
POPIA, built for the Eduvos ITNPA3 project by Group 1.

Section 22 of the Protection of Personal Information Act says a responsible
party must tell the Information Regulator, and the people affected, when
personal information has been compromised. CyberSerious is the software behind
that duty. The organisation side records a suspected breach and prepares the
notification. The regulator side receives it, opens a case, and keeps track of
what happens next.

Every record in this repository is synthetic. Nothing here reports to the real
Information Regulator, and no real personal information sits in the database.

## Where the project is right now

The four pages already work as one connected prototype. The dashboard, the
notification register, the alerts list and the breach detail page all read from
the same dataset, and a case reference in the link opens the matching record.

What is still missing:

- the dataset lives in `js/app.js`, so a page refresh throws away any change
- there is no login. Every page shows the same placeholder user
- notes and status changes appear on screen but are not saved
- the alerts are fixtures. The rules are not evaluated from case facts yet
- the organisation side of the workflow does not exist as software

`CHECKLIST.md` lists the whole build, phase by phase, with a tick per task.

## Run it

No build step and no server code are needed yet.

```
python3 -m http.server 8000
```

Then open http://localhost:8000/index.html

## Layout

```
index.html           dashboard: counts, recent activity, priority alerts
notifications.html   register of cases with search and filters
alerts.html          attention flags with their rule and reason
breach.html          case detail, opened with ?id=BR-2026-001
js/app.js            shared data and the render functions
css/style.css        the one stylesheet
fixtures/            fictional names and the mapping to what they replace
docs/                project notes: baseline, check logs
.agent/              writing and code rules used while building this branch
```

## Limits worth stating plainly

- this is a coursework prototype, not an official reporting channel
- alerts point at cases that deserve a look. They are not compliance verdicts
- the demo dates sit between January and May 2026 to match the research window
- receipts from the test intake are labelled as test receipts

## Project documents

`CHECKLIST.md` tracks progress. `STATUS.md` logs each task with the command
that was run and what it printed. Research material for the four case studies
is kept apart from the software fixtures, with a source and a confidence label
for every claim.

Group 1, Eduvos ITNPA3. Repository maintained by the group.