#!/bin/bash
# Pins the toolchain for this repo. Source me, do not execute.
export PATH="$HOME/.local/node24/bin:/opt/homebrew/opt/postgresql@16/bin:$PATH"
export PGDATA="${PGDATA:-/opt/homebrew/var/postgresql@16}"
# Dev and test databases. Local only, never used outside this machine.
export DATABASE_URL="${DATABASE_URL:-postgres://cyberserious:cyberserious_dev_only@localhost:5432/cyberserious_dev}"
export DATABASE_URL_TEST="${DATABASE_URL_TEST:-postgres://cyberserious:cyberserious_dev_only@localhost:5432/cyberserious_test}"
# Frozen clock for fixtures so seeds and tests never drift.
export FIXTURE_NOW="${FIXTURE_NOW:-2026-10-13T08:00:00Z}"
export PORT="${PORT:-8100}"
