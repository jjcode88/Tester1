#!/usr/bin/env bash
# Runs the schema tests.
#
#   DATABASE_URL=postgres://... npm run test:db    against any empty Postgres 15+
#   SUPABASE=1 DATABASE_URL=... npm run test:db    against a real Supabase stack
#                                                  (migrations already applied)
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DATABASE_URL:?Set DATABASE_URL to a Postgres connection string}"
run() { psql "$DATABASE_URL" --quiet --no-psqlrc -o /dev/null -v ON_ERROR_STOP=1 -f "$1"; }

if [ -z "${SUPABASE:-}" ]; then
  run tests/00_local_auth_stub.sql
  for migration in migrations/*.sql; do run "$migration"; done
fi
run tests/10_policies.sql
