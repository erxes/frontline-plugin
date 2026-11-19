// Copies one organisation's documents from the old erxes Mongo into this plugin's tables,
// following scripts/import-map.ts, then moves its ticket properties to core's custom fields.
// Run it with the API's environment (.env), whose SECRETS_KEY seals the imported tokens:
//
//   MONGO_URL=mongodb://… ORG_ID=<core org id> [CORE_API_KEY=<an owner's API key>] \
//     pnpm migrate:import [-- --dry-run] [-- --only <collection>]
//
// Rows keep the Mongo `_id` as `id` and upsert by their primary key, so a second run from a fresh
// dump updates what it copied before and adds the rest. A table imports after the tables its
// foreign keys point at. The whole copy is one transaction: a row a transform or a constraint
// refuses is skipped and listed with its reason, and `--dry-run` rolls everything back, so it
// prints the same counts and refusals and writes nothing.
//
// Departments and branches land in frontline_teams, the copy of core's units. Once any are copied
// the organisation's adopted mark is cleared, so the next units job brings them to core before it
// syncs the copy (api/src/modules/teams/sync.ts).
import { parseArgs } from 'node:util';
import { type Document, MongoClient, ObjectId } from 'mongodb';
import { DatabaseError, Pool, type PoolClient } from 'pg';
import { AFTER_COPY, IMPORT_MAP, type Source, UNITS_TO_CORE } from './import-map.ts';
import { moveTicketProperties } from './move-ticket-properties.ts';

const BATCH = 500;

const { values: args } = parseArgs({
  options: { only: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } },
});

const dryRun = args['dry-run'];
const { MONGO_URL, DATA_URL, ORG_ID, CORE_URL, CORE_API_KEY } = process.env;

if (!MONGO_URL || !DATA_URL || !ORG_ID) {
  console.error('Set MONGO_URL and ORG_ID, and the API environment with DATA_URL and SECRETS_KEY.');
  process.exit(1);
}

const orgId = ORG_ID;

type Column = { array: boolean; json: boolean; text: boolean; hasDefault: boolean };

/** Not null, foreign key, check, unique, a value its type can't read, a number out of range. */
const REFUSED = new Set(['23502', '23503', '23514', '23505', '22P02', '22003', '22007', '22008']);

const plain = (value: unknown): unknown => {
  if (value instanceof ObjectId) return value.toHexString();

  if (Array.isArray(value)) return value.map(plain);

  if (value instanceof Date || value === null || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, plain(inner)]));
};

/** A field's value, following dots into embedded documents (`sla.resolvedAt`). */
const fieldOf = (document: Document, path: string) =>
  path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        value instanceof Object ? new Map(Object.entries(value)).get(key) : undefined,
      document,
    );

const read = (document: Document, source: Source) =>
  typeof source === 'string' ? fieldOf(document, source) : source(document, orgId);

/** A value as its column takes it; undefined lets the column's default fill it. */
const cell = (value: unknown, column: Column) => {
  const flat = plain(value);

  if (flat === undefined || flat === null) return column.hasDefault ? undefined : null;

  // Old forms saved a cleared number or id as ''; only a text column can hold it.
  if (flat === '' && !column.text && !column.json) return column.hasDefault ? undefined : null;

  if (column.json) return JSON.stringify(flat);

  // An array column takes an array as it is and a single value as a one-item array.
  if (column.array) return [flat].flat();

  if (typeof flat === 'object' && !(flat instanceof Date)) return JSON.stringify(flat);

  return flat;
};

const mongo = await MongoClient.connect(MONGO_URL);
const pool = new Pool({ connectionString: DATA_URL });
const client = await pool.connect();
const refused: string[] = [];
const counts: string[] = [];

/** Runs `work` behind a savepoint, so a refused statement undoes only itself. */
const guarded = async (work: () => Promise<unknown>) => {
  await client.query('SAVEPOINT row');

  try {
    await work();
    await client.query('RELEASE SAVEPOINT row');
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT row');
    throw error;
  }
};

const describe = async (table: string) => {
  const { rows } = await client.query<{
    column_name: string;
    data_type: string;
    column_default: string | null;
  }>(
    'SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = $1',
    [table],
  );

  const { rows: keys } = await client.query<{ name: string }>(
    `SELECT a.attname AS name FROM pg_index i
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = $1::regclass AND i.indisprimary`,
    [table],
  );

  if (rows.length === 0) throw new Error(`No table ${table}: run the migrations first`);

  return {
    columns: new Map(
      rows.map((row) => [
        row.column_name,
        {
          array: row.data_type === 'ARRAY',
          json: row.data_type === 'jsonb' || row.data_type === 'json',
          text: row.data_type === 'text',
          hasDefault: row.column_default !== null,
        },
      ]),
    ),
    primaryKey: keys.map((key) => key.name),
  };
};

try {
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);

  const { rows: references } = await client.query<{ child: string; parent: string }>(
    `SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent
     FROM pg_constraint WHERE contype = 'f' AND conrelid <> confrelid`,
  );

  /** How many foreign keys deep a table sits: channels 0, pipelines 1, their statuses 2. */
  const depth = (table: string, seen: string[] = []): number =>
    Math.max(
      0,
      ...references
        .filter(({ child, parent }) => child === table && !seen.includes(parent))
        .map(({ parent }) => 1 + depth(parent, [...seen, table])),
    );

  const entries = IMPORT_MAP.toSorted((a, b) => depth(a.table) - depth(b.table));
  const stale = new Set<string>();

  for (const { collection, table, pipeline = [], columns } of entries) {
    if (args.only && args.only !== collection) continue;

    const known = await describe(table);
    const sources = Object.entries(columns);

    for (const [name] of sources)
      if (!known.columns.has(name)) throw new Error(`import-map: no column ${table}.${name}`);

    const names = ['org_id', ...sources.map(([name]) => name)];
    const key = known.primaryKey;
    const updates = names.filter((name) => !key.includes(name));

    const conflict =
      updates.length > 0
        ? `ON CONFLICT (${key.map((name) => `"${name}"`).join(', ')}) DO UPDATE SET ${updates
            .map((name) => `"${name}" = EXCLUDED."${name}"`)
            .join(', ')}`
        : 'ON CONFLICT DO NOTHING';

    type Row = { id: string; values: unknown[] };

    const insert = async (rows: Row[]) => {
      // A batch can't name one key twice in an upsert; the later document wins.
      const unique = [
        ...new Map(
          rows.map((row) => [
            JSON.stringify(key.map((name) => row.values[names.indexOf(name)])),
            row,
          ]),
        ).values(),
      ];

      const params: unknown[] = [];

      const tuples = unique.map(
        (row) =>
          `(${row.values
            .map((value) => {
              if (value === undefined) return 'DEFAULT';
              params.push(value);

              return `$${params.length}`;
            })
            .join(', ')})`,
      );

      const result = await client.query(
        `INSERT INTO "${table}" (${names.map((name) => `"${name}"`).join(', ')}) VALUES ${tuples.join(', ')} ${conflict}`,
        params,
      );

      return result.rowCount ?? 0;
    };

    let copied = 0;
    let seen = 0;
    let skipped = 0;

    // A batch a constraint refuses goes again a row at a time, so one orphan skips only itself.
    const write = async (rows: Row[]) => {
      try {
        await guarded(async () => {
          copied += await insert(rows);
        });
      } catch (error) {
        if (!(error instanceof DatabaseError && REFUSED.has(error.code ?? ''))) throw error;

        if (rows.length > 1) for (const row of rows) await write([row]);
        else {
          skipped += 1;
          refused.push(`${collection} ${rows[0]?.id ?? ''}: ${error.message}`);
        }
      }
    };

    let batch: Row[] = [];
    const cursor = mongo
      .db()
      .collection(collection)
      .aggregate(pipeline, { allowDiskUse: true, batchSize: BATCH });

    for await (const document of cursor) {
      seen += 1;

      const id = JSON.stringify(plain(document._id));

      try {
        const values = [
          orgId,
          ...sources.map(([name, source]) =>
            cell(read(document, source), known.columns.get(name) ?? { array: false, json: false, text: false, hasDefault: false }),
          ),
        ];

        batch.push({ id, values });
      } catch (error) {
        skipped += 1;
        refused.push(`${collection} ${id}: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (batch.length === BATCH) {
        await write(batch);
        batch = [];
      }
    }

    if (batch.length > 0) await write(batch);

    counts.push(`${collection} → ${table}: ${copied} rows from ${seen} documents, ${skipped} refused`);

    const after = AFTER_COPY[table];

    if (after && copied > 0) for (const statement of after) stale.add(statement);
  }

  for (const statement of stale) await client.query(statement);

  await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');

  if (!dryRun && stale.has(UNITS_TO_CORE))
    console.info('Team rows copied: the next units job (teams.units-sync) brings them to core');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}

try {
  console.info(counts.join('\n'));

  if (refused.length > 0) console.info(`Refused ${refused.length}:\n  ${refused.join('\n  ')}`);

  if (args.only) console.info('Ticket properties not moved: --only copies one collection');
  else if (dryRun || !CORE_URL || !CORE_API_KEY)
    console.info(
      `Ticket properties not moved${dryRun ? ' in a dry run' : ': set CORE_URL and CORE_API_KEY'}; tickets keep old erxes field ids until they are`,
    );
  else console.info(await moveTicketProperties({ coreUrl: CORE_URL, apiKey: CORE_API_KEY, mongo, pool, orgId }));

  if (dryRun) console.info('Dry run: nothing was written');
} finally {
  await mongo.close();
  await pool.end();
}
