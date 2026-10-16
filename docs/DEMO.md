# Demo script, fifteen to twenty minutes

Reset both databases first so every number below holds. Keep the
server terminal visible: the one-time codes appear there.

## Reset

`npm run db:migrate && npm run db:seed && npm run db:migrate:org && npm run db:seed:org`

Expect 7 cases, 6 notifications, 10 alerts and 11 sources.

## The six steps across both systems

**1. Sign in as the analyst.** Open the regulator login page.
Enter analyst1 with the lab password, read the code from the
terminal, enter it. The dashboard shows 7 cases, 6 notifications,
5 open and 10 alerts.

**2. Walk the register to a case.** Open notifications, filter to
Closed, count 2. Search Karoo, see only Karoo rows. Open
BR-2026-0001. Badges, duties and facts belong to that case alone.
Open an unknown id and show the not-found state.

**3. Do case work.** Add a note and watch it persist. Try moving the
case as the analyst and show the refusal. Sign in as supervisor1 in
a second browser and move it with a reason. Reload and show both.

**4. Draft and approve as the organisation.** On port 8200, sign in
as steward1, write a draft, send it for approval. Approve as io1
and show the bound revision and hash. Edit the draft and show the
approval clearing.

**5. Send and receipt.** Send the approved draft. Show the receipt
with the test_receiver label. Retry the same submission and show
the original receipt returning. Change one byte under the same id
and show the 409.

**6. Rules and research.** Trigger the worker and show two alerts
opening for the new case. Resolve one with a reason. Open the
research page and trace one finding to its source and confidence.

## If something fails live

Say so, show the log, and point at the matching TEST_LOG.md row.
A failed demo with an honest log beats a faked pass.
