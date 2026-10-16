# ADR-0006: Parameterised SQL, no object mapper

Date: 2026-10-16. Owner: Group 1.

Every database call goes through the pg driver with parameterised
statements. There is no object mapper between the routes and the
tables.

The schema is small and the queries are plain. An object mapper
would hide the exact statements from the marker while adding
nothing the project needs. Writing SQL by hand keeps each query
visible in review, and placeholders on every value close off the
injection path by construction.

The single db module owns the connection pool. Routes never open
their own connections.
