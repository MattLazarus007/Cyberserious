# Demo script, fifteen to twenty minutes

Reset both databases first so every number below holds. Keep the
server terminal visible: the one-time codes appear there. Every
account and password is listed in README.md.

## Reset

`node db/seed.ts --reset && node db/seed_org.ts --reset && node tools/org-sender.ts --register`

Expect 7 cases, 6 notifications, 11 alerts and 13 sources. The
register line renews the sender key the portal needs.

## The six steps across both systems

**1. Sign in as the analyst.** Open the regulator login page.
Enter analyst1 with demo-analyst-pass, read the code from the
terminal, enter it. The dashboard shows 7 cases, 6 notifications,
5 open and 11 alerts.

**2. Walk the register to a case.** Open notifications, filter to
Closed, count 2. Search Karoo, see only Karoo rows. Open
BR-2026-0001. Badges, duties and facts belong to that case alone.
Open an unknown id and show the not-found state.

**3. Do case work.** Add a note and watch it persist. Try moving the
case as the analyst and show the refusal. Sign in as supervisor1 in
a second browser and move it with a reason. Reload and show both.

**4. Draft and approve as the organisation.** On port 8200, sign in
as steward1, write a draft with 25 affected people, send it for
approval. Approve as io1 and show the bound revision and hash. Edit
a draft and show the approval clearing.

**5. Send, receipt and the affected people.** Send the approved
draft. Show the receipt with the test_receiver label. Real reports
go through the Regulator's eServices Portal. Retry the same
submission and show the original receipt returning. Change one byte
under the same id and show the 409. As io1, record the affected-person
notice, show 24 of 25 sent by email and the one failed synthetic
delivery. The case page now carries the counts and a shortfall alert.

**6. Rules and research.** Watch the worker open alerts for the new
case. Resolve one with a reason. Open the
research page and trace one finding to its source and confidence.

## If something fails live

Say so, show the log, and point at the matching TEST_LOG.md row.
A failed demo with an honest log beats a faked pass.
