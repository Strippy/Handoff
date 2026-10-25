#!/usr/bin/env bash
# Local database tests: fresh database, Supabase stubs, migrations, then the RLS suite.
# Needs a local Postgres. PGHOST/PGPORT/PGUSER select it (default: socket /opt/pgtest, port 54322).
set -euo pipefail
cd "$(dirname "$0")/../.."
export PGHOST="${PGHOST:-/opt/pgtest}" PGPORT="${PGPORT:-54322}" PGUSER="${PGUSER:-postgres}"
DB="${TEST_DB:-handoff_test}"
psql -q -c "drop database if exists $DB" -c "create database $DB" >/dev/null
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/db/supabase-stubs.sql >/dev/null
for f in supabase/migrations/*.sql; do
  case "$f" in *_storage.sql) continue ;; esac   # storage schema exists only on Supabase
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null
done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/db/rls.test.sql
