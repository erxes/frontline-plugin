// Copies one organisation's old erxes data (Mongo: `erxes`, and the old copies `erxes_office` and
// `erxes_office_integrations`) into this plugin's tables, in one transaction.
//
//   MONGO_URL=mongodb://… DATA_URL=postgres://… ORG_ID=<core org id> \
//     pnpm migrate:import [-- --write] [--only <database.collection>] [--limit N]
//
// A dry run by default: it runs everything, rolls back and prints the report; `--write` commits.
// Rows keep the Mongo `_id`, and every insert is `ON CONFLICT DO NOTHING`, so a second run copies
// nothing new. A refused row is skipped and listed; the report, per source collection, goes to
// `REPORT_DIR` (default `reports/`) as `frontline-<time>.json`.
//
// Users, customers, companies and fields resolve through core's `officenext_import.id_map`.
// Departments and branches land in frontline_teams, the copy of core's units; once any are
// copied the organisation's adopted mark is cleared, so the next units job brings them to core
// before it syncs the copy (api/src/modules/teams/sync.ts).
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { MongoClient } from 'mongodb';
import { Pool } from 'pg';
import { Context } from './import/context.ts';
import { Writer } from './import/engine.ts';
import { LEFT_OUT } from './import/leftOut.ts';
import { Report } from './import/report.ts';
import { runStep } from './import/step.ts';
import { STEPS } from './import/steps/index.ts';
import { idOf } from './import/values.ts';

const { values: args } = parseArgs({
  options: {
    write: { type: 'boolean', default: false },
    only: { type: 'string' },
    limit: { type: 'string' },
    owner: { type: 'string' },
  },
});

const { MONGO_URL, DATA_URL, ORG_ID, REPORT_DIR = 'reports' } = process.env;

if (!MONGO_URL || !DATA_URL || !ORG_ID) {
  console.error('Set MONGO_URL, DATA_URL and ORG_ID.');
  process.exit(1);
}

/** The copy of core's units: rows copied here must reach core before the next sync. */
const UNITS_TO_CORE = 'UPDATE frontline_unit_sync SET adopted_at = NULL';

/** What rows copied into a table leave stale, and the statement that brings it up to date. */
const AFTER_COPY: Record<string, string> = {
  frontline_teams: UNITS_TO_CORE,
  frontline_team_members: UNITS_TO_CORE,
  // A conversation keeps the members its messages mention.
  frontline_messages: `UPDATE frontline_conversations c SET mentioned_user_ids = array(
    SELECT DISTINCT unnest(m.mentioned_user_ids) FROM frontline_messages m WHERE m.conversation_id = c.id
  )`,
  // A pipeline counts on from its last number; without one, from its tickets' highest.
  frontline_tickets: 'UPDATE frontline_pipelines SET last_number_prefix = NULL',
  // Every integration has the public key its embed or webhook carries, as migration 0025 gave
  // the ones before it.
  frontline_integrations: `INSERT INTO frontline_public_keys (key, org_of, kind, target_id)
    SELECT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), i.org_id, 'integration', i.id
    FROM frontline_integrations i
    WHERE NOT EXISTS (
      SELECT 1 FROM frontline_public_keys k WHERE k.kind = 'integration' AND k.target_id = i.id
    )`,
};

/** The member who made most old channels owns what the import makes itself. */
const ownerOf = async (ctx: Context) => {
  if (args.owner) return args.owner;

  const [top] = await ctx.main
    .collection('channels')
    .aggregate<{ userId: unknown }>([
      { $match: { userId: { $type: 'string', $ne: '' } } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 },
      { $project: { userId: '$_id' } },
    ])
    .toArray();

  const owner = ctx.user(idOf(top?.userId));

  if (!owner) throw new Error('No old channel names its creator: pass --owner <core user id>');

  return owner;
};

// Old mail bodies are most of the bytes, and zlib sends them a fifth the size through a tunnel.
// A read that hears nothing for five minutes (long scans of conformities included) fails the run.
const mongo = new MongoClient(MONGO_URL, {
  directConnection: true,
  compressors: ['zlib'],
  socketTimeoutMS: 300_000,
});

const pool = new Pool({ connectionString: DATA_URL, keepAlive: true });
const client = await pool.connect();
const report = new Report();
const startedAt = new Date();
let failure: string | null = null;

// A lost connection mid-run reaches the client as an event; the run's next query fails with it.
client.on('error', (error) => console.error(`Postgres connection lost: ${error.message}`));

try {
  await mongo.connect();
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.org_id', $1, true)", [ORG_ID]);

  const ctx = new Context({
    orgId: ORG_ID,
    client,
    writer: new Writer(client, report, ORG_ID),
    report,
    main: mongo.db('erxes'),
    office: mongo.db('erxes_office'),
    officeIntegrations: mongo.db('erxes_office_integrations'),
    limit: args.limit ? Number(args.limit) : undefined,
  });

  console.info(`Core id map: ${await ctx.loadIdMap()} merged ids`);
  ctx.owner = await ownerOf(ctx);

  // `--only` still runs every earlier step, so the one asked for finds its parents.
  const last = args.only ? STEPS.findIndex((step) => step.source === args.only) : STEPS.length - 1;

  if (last < 0)
    throw new Error(
      `No step reads ${args.only}; the sources are:\n  ${STEPS.map((step) => step.source).join('\n  ')}`,
    );

  for (const step of STEPS.slice(0, last + 1)) {
    const started = Date.now();

    await runStep(ctx, step);
    console.info(
      `${step.source}: ${report.of(step.source).seen} read in ${Math.round((Date.now() - started) / 1000)} s`,
    );
  }

  if (!args.only)
    for (const { source, reason } of LEFT_OUT) {
      const [database = '', ...rest] = source.split('.');

      report.leftOut(
        source,
        await mongo.db(database).collection(rest.join('.')).estimatedDocumentCount(),
        reason,
      );
    }

  const stale = new Set(
    Object.entries(AFTER_COPY).flatMap(([table, statement]) =>
      report.copiedInto(table) > 0 ? [statement] : [],
    ),
  );

  for (const statement of stale) await client.query(statement);

  await client.query(args.write ? 'COMMIT' : 'ROLLBACK');
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
  await client.query('ROLLBACK').catch(() => undefined);
} finally {
  client.release();
  await pool.end();
  await mongo.close();
}

const file = join(REPORT_DIR, `frontline-${startedAt.toISOString().replace(/[:.]/g, '-')}.json`);

await mkdir(REPORT_DIR, { recursive: true });

await writeFile(
  file,
  JSON.stringify(
    {
      write: args.write,
      only: args.only ?? null,
      limit: args.limit ?? null,
      startedAt,
      endedAt: new Date(),
      failure,
      sources: report,
    },
    null,
    2,
  ),
);

console.info(report.lines().join('\n'));

if (failure) {
  console.error(`\nFailed and rolled back: ${failure}. Report so far: ${file}`);
  process.exitCode = 1;
} else
  console.info(
    `\n${args.write ? 'Committed' : 'Dry run, rolled back'}: ${report.copiedTotal()} rows copied. Report: ${file}`,
  );
