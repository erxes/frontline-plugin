import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterAll } from 'vite-plus/test';

// Runs before each test file: a throwaway database owned by a role without
// BYPASSRLS, like the plugin role core creates, migrated from drizzle/.
const adminUrl = process.env.DATA_TEST_URL;

if (!adminUrl) {
  throw new Error(
    'Set DATA_TEST_URL to a Postgres superuser, e.g. postgres://postgres:postgres@127.0.0.1:5432/postgres',
  );
}

const ROLE = 'frontline_test';
const database = `frontline_test_${randomBytes(4).toString('hex')}`;

// Core's tenant functions, which plugin migrations call.
const CORE_FUNCTIONS = readFileSync(new URL('./core-functions.sql', import.meta.url), 'utf8');

// Core's core_live_signal(), with core's signature (erxes packages/db/drizzle/0010 and
// 0012_tenant_isolation.sql), less its check of core's plugin installations. Core should ship
// it in core-functions.sql (erxes/erxes#10575).
const CORE_LIVE = `
CREATE OR REPLACE FUNCTION core_live_signal(p_org_id text, p_plugin text, p_topic text, p_user_ids text[] DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_plugin !~ '^[a-z][a-z0-9_]{0,39}$' OR p_topic !~ '^[a-z0-9][a-z0-9._:-]{0,99}$' THEN
    RAISE EXCEPTION 'core_live_signal: invalid plugin or topic';
  END IF;
  PERFORM pg_notify('core_live', json_build_object('o', p_org_id, 'k', 'plugin', 'p', p_plugin, 't', p_topic, 'u', p_user_ids)::text);
END $$;`;

const urlOf = (name: string, role?: string) => {
  const url = new URL(adminUrl);

  url.pathname = `/${name}`;

  if (role) {
    url.username = role;
    url.password = role;
  }

  return url.toString();
};

const run = async (url: string, statement: string) => {
  const client = new Client({ connectionString: url });

  await client.connect();

  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
};

await run(
  adminUrl,
  `DO $$ BEGIN CREATE ROLE ${ROLE} LOGIN NOBYPASSRLS PASSWORD '${ROLE}';
   EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$`,
);

await run(adminUrl, `CREATE DATABASE ${database} OWNER ${ROLE}`);

await run(urlOf(database), `${CORE_FUNCTIONS}${CORE_LIVE}`);

process.env.DATA_URL = urlOf(database, ROLE);

const { runMigrations } = await import('#/db/migrate.ts');

await runMigrations();

afterAll(async () => {
  const { pool } = await import('#/db/client.ts');

  await pool.end();
  await run(adminUrl, `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
});
