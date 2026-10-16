# ADR-0007: The built-in test runner

Date: 2026-10-16. Owner: Group 1.

Unit and integration tests run on node:test with node:assert/strict.
No test framework is installed.

The suite is small and the built-in runner covers it: fast unit
checks, database-backed route tests, and later browser flows through
a separate script. Skipping the framework keeps installs quick and
means every group member runs the same runner with no setup.

If the suite ever needs browser farms or parallel sharding, the
decision gets revisited. Until then this stays.
