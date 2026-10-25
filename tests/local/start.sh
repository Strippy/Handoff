#!/usr/bin/env bash
# Local test only: fresh test database + PostgREST + gateway. Needs Postgres (tests/db/run.sh settings)
# and a PostgREST binary in POSTGREST_BIN.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PGHOST="${PGHOST:-/opt/pgtest}" PGPORT="${PGPORT:-54322}" PGUSER="${PGUSER:-postgres}"
DB="${TEST_DB:-handoff_e2e}"
SECRET="$(node -e "import('./tests/local/jwt.mjs').then(m => process.stdout.write(m.JWT_SECRET))")"
for pidfile in /opt/pgtest/postgrest.pid /opt/pgtest/gateway.pid; do
  [ -f "$pidfile" ] && kill "$(cat "$pidfile")" 2>/dev/null || true
done
fuser -k 54330/tcp 54321/tcp >/dev/null 2>&1 || true
psql -q -c "drop database if exists $DB with (force)" -c "create database $DB" >/dev/null
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/db/supabase-stubs.sql >/dev/null 2>&1
for f in supabase/migrations/*.sql; do
  case "$f" in *_storage.sql) continue ;; esac
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null
done
CONF=/opt/pgtest/handoff-pgrst.conf
cat > "$CONF" <<CONF
db-uri = "postgres://authenticator@/$DB?host=$PGHOST&port=$PGPORT"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-port = 54330
db-max-rows = 1000
CONF
nohup "${POSTGREST_BIN:-postgrest}" "$CONF" > /opt/pgtest/postgrest.log 2>&1 &
echo $! > /opt/pgtest/postgrest.pid
nohup node --import tsx tests/local/gateway.mjs > /opt/pgtest/gateway.log 2>&1 &
echo $! > /opt/pgtest/gateway.pid
for i in $(seq 1 40); do
  curl -sf -o /dev/null http://127.0.0.1:54330/ && curl -s -o /dev/null http://127.0.0.1:54321/ && break
  sleep 0.5
done
echo "local stack up: db=$DB postgrest=:54330 gateway=:54321"
