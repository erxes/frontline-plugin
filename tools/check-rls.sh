#!/usr/bin/env bash
# Migrates a throwaway database on DATA_TEST_URL's server, runs the tenancy
# guard (tools/check-rls.sql) on it and fails on any problem it lists.
set -euo pipefail

cd "$(dirname "$0")/.."

server=${DATA_TEST_URL:?Set DATA_TEST_URL to a Postgres superuser URL, as for vp run test}
name="frontline_rls_check_$$"
# The same server and options, another database (a dbname option would override the path).
url=$(node -e 'const u = new URL(process.argv[1]); u.pathname = `/${process.argv[2]}`; u.searchParams.delete("dbname"); process.stdout.write(u.href)' "$server" "$name")

# Core's role for plugins' views, which migrations grant to; core's own stack has it.
psql "$server" -qX -v ON_ERROR_STOP=1 -c 'DO $$ BEGIN CREATE ROLE erxes_core_reader NOLOGIN NOBYPASSRLS;
  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$'
psql "$server" -qX -v ON_ERROR_STOP=1 -c "CREATE DATABASE $name"
trap 'psql "$server" -qX -c "DROP DATABASE IF EXISTS $name WITH (FORCE)"' EXIT

# Core's tenant functions, which the migrations call.
psql "$url" -qX -v ON_ERROR_STOP=1 -f api/src/test/core-functions.sql
# Only DATA_URL matters to a migration; the others satisfy config.ts.
DATA_URL="$url" CORE_URL=http://127.0.0.1:9 PLUGIN_SECRET=rls-check-only-secret-xxxxxxxxxxxx \
  SECRETS_KEY=cmxzLXNlY3JldHMta2V5LTMyLWJ5dGVzLWxvbmchISE= \
  LOG_LEVEL=silent pnpm --silent db:migrate > /dev/null

problems=$(psql "$url" -qXAt -v ON_ERROR_STOP=1 -v scope=frontline -v policy=tenant -f tools/check-rls.sql)

if [[ -n "$problems" ]]; then
  echo "$problems"
  echo 'Tenancy guard failed (tools/check-rls.sql).'
  exit 1
fi

echo 'Every table with org_id has forced row level security and only the tenant policy, every other table is listed, every name starts with frontline_.'
