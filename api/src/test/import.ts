// Runs the importer's steps on synthetic old documents against the test database.
import { MongoClient } from 'mongodb';
import type { Document } from 'mongodb';
import { pool } from '#/db/client.ts';
import { Context } from '../../../scripts/import/context.ts';
import { Writer } from '../../../scripts/import/engine.ts';
import { Report } from '../../../scripts/import/report.ts';
import { runStep } from '../../../scripts/import/step.ts';
import { STEPS } from '../../../scripts/import/steps/index.ts';

export const ORG = 'org-import-a';
export const CHANNEL = 'import-channel';

// The steps read these documents instead of Mongo, which the tests never reach.
const offline = new MongoClient('mongodb://127.0.0.1:9').db('erxes');

/** A query in `ORG`, as row-level security shows it. */
export const query = async (sql: string, params: unknown[] = []) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.org_id', $1, true)", [ORG]);
    const { rows } = await client.query<Record<string, unknown>>(sql, params);

    await client.query('COMMIT');

    return rows;
  } finally {
    client.release();
  }
};

/** Runs the named steps on synthetic old documents, as one committed import of `ORG`. */
export const importDocuments = async (
  runs: [source: string, documents: Document[]][],
  prepare: (ctx: Context) => void = () => undefined,
) => {
  const client = await pool.connect();
  const report = new Report();

  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.org_id', $1, true)", [ORG]);

    const ctx = new Context({
      orgId: ORG,
      client,
      writer: new Writer(client, report, ORG),
      report,
      main: offline,
      office: offline,
      officeIntegrations: offline,
      limit: undefined,
    });

    ctx.owner = 'user-owner';
    ctx.remember('channel', CHANNEL, CHANNEL);
    prepare(ctx);

    // One after another, as the importer runs them: a step finds the rows the earlier ones gave.
    await runs.reduce(async (previous, [source, documents]) => {
      await previous;

      const step = STEPS.find((candidate) => candidate.source === source);

      if (!step) throw new Error(`No step reads ${source}`);

      await runStep(ctx, { ...step, documents: () => documents });
    }, Promise.resolve());

    await client.query('COMMIT');
  } finally {
    client.release();
  }

  return report.toJSON();
};

/** The channel the synthetic documents name, which a test file makes before it imports. */
export const addChannel = () =>
  query(
    `INSERT INTO frontline_channels (id, org_id, name, created_by) VALUES ($1, $2, 'Sales', 'user-owner')`,
    [CHANNEL, ORG],
  );
