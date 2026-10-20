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
export ORG_DATABASE_URL="${ORG_DATABASE_URL:-postgres://cyberserious:cyberserious_dev_only@localhost:5432/cyberserious_org_dev}"
export ORG_DATABASE_URL_TEST="${ORG_DATABASE_URL_TEST:-postgres://cyberserious:cyberserious_dev_only@localhost:5432/cyberserious_org_test}"
export ORG_PORT="${ORG_PORT:-8200}"
export REGULATOR_INTAKE_URL="${REGULATOR_INTAKE_URL:-http://localhost:8100/intake/v1/submissions}"
# Lab simple sign-in. Set to 1 when the group demos together and the
# console code slows everyone down. Lab only, never beyond it.
export LAB_SIMPLE_LOGIN="${LAB_SIMPLE_LOGIN:-0}"
# Key for sealed research notes. Lab only. One per shell, never committed.
if [ -z "${RESEARCH_KEY:-}" ]; then
  export RESEARCH_KEY="$(openssl rand -hex 32)"
fi
