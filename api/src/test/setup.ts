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

// Core's event stream and core_publish_event(), with core's signature and body
// (erxes packages/db/drizzle/0007 and 0012_tenant_isolation.sql), less the
// installation check of core_enter_org(), which needs core's plugin tables.
// Core should ship both in core-functions.sql (erxes/erxes#10575).
const CORE_EVENTS = `
CREATE TABLE core_events (
  id text PRIMARY KEY NOT NULL,
  seq bigserial NOT NULL,
  tx_id xid8 DEFAULT pg_current_xact_id() NOT NULL,
  org_id text NOT NULL,
  source text NOT NULL,
  type text NOT NULL,
  version integer DEFAULT 1 NOT NULL,
  subject_type text,
  subject_id text,
  entity_type text,
  entity_id text,
  actor_type text NOT NULL,
  actor_id text,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  summary text,
  link text,
  notify jsonb,
  dedupe_key text,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX core_events_dedupe_key ON core_events (org_id, source, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
GRANT SELECT, INSERT ON core_events TO ${ROLE};
GRANT USAGE ON SEQUENCE core_events_seq_seq TO ${ROLE};
CREATE OR REPLACE FUNCTION core_publish_event(
  p_org_id text,
  p_source text,
  p_type text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_subject_type text DEFAULT NULL,
  p_subject_id text DEFAULT NULL,
  p_summary text DEFAULT NULL,
  p_link text DEFAULT NULL,
  p_notify jsonb DEFAULT NULL,
  p_dedupe_key text DEFAULT NULL,
  p_actor_user_id text DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_id text;
  v_current text := nullif(current_setting('app.org_id', true), '');
BEGIN
  IF p_type NOT LIKE p_source || '.%' THEN
    RAISE EXCEPTION 'core_publish_event: the type must start with "%."', p_source;
  END IF;
  IF p_subject_type IS NOT NULL AND p_subject_type NOT IN ('customer', 'company') THEN
    RAISE EXCEPTION 'core_publish_event: subject type must be customer or company';
  END IF;
  IF v_current IS NULL THEN
    PERFORM set_config('app.org_id', p_org_id, true);
  ELSIF v_current <> p_org_id THEN
    RAISE EXCEPTION 'this transaction works for organisation %, not %', v_current, p_org_id;
  END IF;
  INSERT INTO core_events (
    id, org_id, source, type, payload, subject_type, subject_id, summary, link, notify, dedupe_key,
    actor_type, actor_id, entity_type, entity_id, occurred_at
  ) VALUES (
    replace(gen_random_uuid()::text, '-', ''), p_org_id, p_source, p_type, coalesce(p_payload, '{}'::jsonb),
    p_subject_type, p_subject_id, p_summary, p_link, p_notify, p_dedupe_key,
    CASE WHEN p_actor_user_id IS NULL THEN 'plugin' ELSE 'user' END, coalesce(p_actor_user_id, p_source),
    p_entity_type, p_entity_id, coalesce(p_occurred_at, now())
  )
  ON CONFLICT (org_id, source, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
`;

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

await run(urlOf(database), CORE_EVENTS);

process.env.DATA_URL = urlOf(database, ROLE);

const { runMigrations } = await import('#/db/migrate.ts');

await runMigrations();

afterAll(async () => {
  const { pool } = await import('#/db/client.ts');

  await pool.end();
  await run(adminUrl, `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
});
