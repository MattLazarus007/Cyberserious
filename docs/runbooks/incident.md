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
