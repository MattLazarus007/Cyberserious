# ADR-0001: One repository, two applications

Date: 2026-10-16. Owner: Group 1.

The regulator workspace and the organisation portal live in one
repository under apps/. Each side keeps its own server, pages and
database. Shared contracts move into packages/contracts once the
second application arrives.

We looked at separate repositories and at a single combined server.
Separate repositories would have split the marker's evidence across
two places. A single server would have blurred the trust boundary
that the whole design depends on.

Each application deploys on its own. A fault on one side never takes
the other down with it. The intake contract between them is versioned,
so either side can change internals without breaking the other.
