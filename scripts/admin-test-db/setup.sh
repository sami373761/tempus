#!/usr/bin/env bash
# Builds the throwaway test database from scratch: Supabase shim, then every
# file in supabase/migrations/ through the real scripts/migrate.ts, then the
# content seeds and the fake players. Refuses any non-local target.
#
#   scripts/admin-test-db/setup.sh            (reads scripts/admin-test-db/.env.test-db)
#
# .env.test-db holds one line, e.g.
#   SUPABASE_DB_URL=postgresql://postgres@127.0.0.1:54317/tempus_test
set -euo pipefail
cd "$(dirname "$0")/../.."

ENV_FILE=scripts/admin-test-db/.env.test-db
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE"; exit 1; }
set -a; . "$ENV_FILE"; set +a

case "$SUPABASE_DB_URL" in
  *@localhost[:/]*|*@127.0.0.1[:/]*) ;;
  *) echo "refusing: SUPABASE_DB_URL is not localhost"; exit 1 ;;
esac

DB_NAME="${SUPABASE_DB_URL##*/}"
ADMIN_URL="${SUPABASE_DB_URL%/*}/postgres"

psql "$ADMIN_URL" -qv ON_ERROR_STOP=1 -c "drop database if exists \"$DB_NAME\" with (force)" -c "create database \"$DB_NAME\""
psql "$SUPABASE_DB_URL" -qv ON_ERROR_STOP=1 -f scripts/admin-test-db/supabase-shim.sql

npm run -s db:migrate
for seed in db:seed:events db:seed:football db:seed:basketball db:seed:screen db:seed:when-born db:seed:descriptions; do
  echo "== $seed"
  npm run -s "$seed"
done
node --experimental-strip-types --no-warnings scripts/admin-test-db/seed-fake.ts
