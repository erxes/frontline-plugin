// Copies one organisation's documents from the old erxes Mongo into this
// plugin's tables, following scripts/import-map.ts.
//
//   MONGO_URL=mongodb://… DATA_URL=postgres://… ORG_ID=<core org id> \
//     pnpm migrate:import [-- --only <collection>]
//
// Rows keep the Mongo `_id` as `id`, so running it again skips what it already
// copied (rows that hit any unique key are skipped). A table imports after the
// tables its foreign keys point at. Tables not in the database yet, fields with
// no column, and documents a constraint refuses (a status whose pipeline is
// gone) are skipped and listed at the end.
//
// Departments and branches land in frontline_teams, the copy of core's units. Once
// any are copied the organisation's adopted mark is cleared, so the next units job
// brings them to core before it syncs the copy (api/src/modules/teams/sync.ts).
import { parseArgs } from 'node:util';
import { type Document, MongoClient, ObjectId } from 'mongodb';
import { DatabaseError, Pool } from 'pg';
import { IMPORT_MAP } from './import-map.ts';

const BATCH = 500;

const { values: args } = parseArgs({ options: { only: { type: 'string' } } });
const { MONGO_URL, DATA_URL, ORG_ID } = process.env;

if (!MONGO_URL || !DATA_URL || !ORG_ID) {
  console.error('Set MONGO_URL, DATA_URL and ORG_ID.');
  process.exit(1);
}

type Column = { array: boolean; json: boolean; text: boolean };

/** Not null, foreign key, check, a value its type can't read, a number out of range. */
const REFUSED = new Set(['23502', '23503', '23514', '22P02', '22003']);

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

const cell = (value: unknown, column: Column) => {
  const flat = plain(value);

  if (flat === undefined || flat === null) return null;

  // Old forms saved a cleared number or id as ''; only a text column can hold it.
  if (flat === '' && !column.text && !column.json) return null;

  if (column.json) return JSON.stringify(flat);

  // An array column takes an array as it is and a single value as a one-item array.
  if (column.array) return [flat].flat();

  if (typeof flat === 'object' && !(flat instanceof Date)) return JSON.stringify(flat);

  return flat;
};

const mongo = await MongoClient.connect(MONGO_URL);
const pool = new Pool({ connectionString: DATA_URL });
const skipped: string[] = [];

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

const stale = new Set<string>();

try {
  const { rows: references } = await pool.query<{ child: string; parent: string }>(
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

  for (const { collection, table, columns, values = {}, unwind } of entries) {
    if (args.only && args.only !== collection) continue;

    const { rows: described } = await pool.query<{ column_name: string; data_type: string }>(
      'SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1',
      [table],
    );

    if (described.length === 0) {
      skipped.push(`${collection}: no table ${table} yet`);
      continue;
    }

    const known = new Map(
      described.map(({ column_name, data_type }) => [
        column_name,
        {
          array: data_type === 'ARRAY',
          json: data_type === 'jsonb' || data_type === 'json',
          text: data_type === 'text',
        },
      ]),
    );

    const fields = Object.entries(columns).filter(([field, name]) => {
      if (known.has(name)) return true;
      skipped.push(`${collection}.${field}: no column ${table}.${name}`);

      return false;
    });

    const constants = Object.entries(values);
    const names = ['org_id', ...constants.map(([name]) => name), ...fields.map(([, name]) => name)];
    const cursor = mongo.db().collection(collection).find({}, { batchSize: BATCH });
    let copied = 0;
    let seen = 0;

    const insert = async (batch: unknown[][]) => {
      const placeholders = batch.map(
        (_, row) => `(${names.map((__, col) => `$${row * names.length + col + 1}`).join(', ')})`,
      );

      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.org_id', $1, true)", [ORG_ID]);

        const result = await client.query(
          `INSERT INTO "${table}" (${names.map((name) => `"${name}"`).join(', ')}) VALUES ${placeholders.join(', ')} ON CONFLICT DO NOTHING`,
          batch.flat(),
        );

        await client.query('COMMIT');
        copied += result.rowCount ?? 0;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    };

    type Row = { id: string; values: unknown[] };

    // A batch a constraint refuses goes again a row at a time, so one orphan skips only itself.
    const write = async (rows: Row[]) => {
      try {
        await insert(rows.map((row) => row.values));
      } catch (error) {
        if (!(error instanceof DatabaseError && REFUSED.has(error.code ?? ''))) throw error;

        if (rows.length > 1) for (const row of rows) await write([row]);
        else skipped.push(`${collection} ${rows[0]?.id ?? ''}: ${error.message}`);
      }
    };

    let batch: Row[] = [];

    for await (const document of cursor) {
      seen += 1;

      // `unwind` turns one document into a row per item of that array field (a user's departmentIds).
      const listed: unknown = unwind ? document[unwind] : undefined;

      const copies = unwind
        ? [listed]
            .flat()
            .filter((item) => item !== undefined && item !== null)
            .map((item) => ({ ...document, [unwind]: item }))
        : [document];

      for (const copy of copies) {
        const { _id: documentId } = copy;

        batch.push({
          id: JSON.stringify(plain(documentId)),
          values: [
            ORG_ID,
            ...constants.map(([, value]) => value),
            ...fields.map(([field, name]) => {
              const column = known.get(name) ?? { array: false, json: false, text: false };

              return cell(fieldOf(copy, field), column);
            }),
          ],
        });

        if (batch.length === BATCH) {
          await write(batch);
          batch = [];
        }
      }
    }

    if (batch.length > 0) await write(batch);

    console.info(`${collection} → ${table}: ${copied} rows copied from ${seen} documents`);

    const after = AFTER_COPY[table];

    if (after && copied > 0) stale.add(after);
  }

  if (stale.size > 0) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.org_id', $1, true)", [ORG_ID]);

      for (const statement of stale) await client.query(statement);
      await client.query('COMMIT');

      if (stale.has(UNITS_TO_CORE))
        console.info('Team rows copied: the next units job (teams.units-sync) brings them to core');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await mongo.close();
  await pool.end();
}

if (skipped.length > 0) console.info(`Skipped:\n  ${skipped.join('\n  ')}`);
