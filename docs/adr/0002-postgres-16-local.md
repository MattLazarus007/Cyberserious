# ADR-0002: PostgreSQL 16 on the lab machine

Date: 2026-10-16. Owner: Group 1.

The system stores its records in PostgreSQL 16, installed as a local
service on the lab machine. Development and test data live in two
separate databases, cyberserious_dev and cyberserious_test, under one
local role.

The specification allows an institution-standard major where the
choice is written down. That is section 5.1, and this file is the
written record. Version 16 is what the lab machine carries, and it
covers every feature the schema needs: UUID generation, JSONB
payloads, range-safe timestamps and partial indexes.

Nothing about the schema ties us to version 16. A move to a newer
major later would mean running the same migration files against it
and re-running the test suite.
