# ADR-0008: One package manifest until the second app

Date: 2026-10-16. Owner: Group 1.

The repository keeps a single root package.json while only the
regulator application exists. Its scripts cover migration, seeding,
tests and the development server.

Splitting manifests now would add ceremony for one application. When
the organisation portal lands in Phase 7, each app gets its own
concerns separated properly and shared contracts move into
packages/contracts.

The test and migration scripts keep working through the split. Only
their paths change.
