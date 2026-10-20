# Incident runbook

Short version for the lab: notice, contain, record, recover, review.
One group member calls the steps while another writes them down.

## Notice

The ready endpoint reports queue depth and age. A warning flag means
jobs wait longer than five minutes. The first check is always whether
the worker process is still running.

## Contain

Stop the worker before touching the queue: find its process and end
it. New web traffic keeps serving reads while jobs wait. Nothing is
deleted during an incident.

### Locked service (security trip)

A burst of unauthenticated /api/ requests from one address trips the
server on its own: every route answers 503 "service locked", all
sessions are revoked, and /health/ready reports {ok:true, locked:true}
so monitoring stays alive. The lock counts requests over a 60 second
window. The threshold comes from TRIP_THRESHOLD, default 100.

The lock lives in memory and in the file data/trip.lock, so a plain
restart does not reopen the service. An operator reopens in either of
two ways:

1. Remove data/trip.lock and restart the server.
2. Restart with TRIP_OPEN=1 in the environment. The boot sees the
   flag, deletes it, and starts open.

A crash or reboot alone never reopens. After reopening, watch the
ready endpoint and the SECURITY-TRIP alert before calling the incident
closed.

## Record

Every step goes into docs/project/exercises with the date. Screenshots
of the queue endpoint before and after count as evidence.

## Recover

Restart the worker with npm run worker. Leased jobs whose lease
expired are picked up again by design. Run the sweep once and confirm
the queue drains through the ready endpoint.

## Review

The benign exercise from 16 October follows exactly this path: a
stopped worker, a queue-age warning, a restart and a drained queue.
Write down what was slow and fix that before the next exercise.
