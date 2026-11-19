// Writes what each source document becomes, in one transaction: a batch of 500 rows per table
// behind a savepoint, `ON CONFLICT DO NOTHING`, and a batch a constraint refuses goes again in
// halves down to the row, so one bad row skips only itself and the run goes on.
import { DatabaseError, type PoolClient } from 'pg';
import type { Report } from './report.ts';

const BATCH = 500;

type Row = Record<string, unknown>;

/** A row and the table it goes to. */
export type Put = readonly [table: string, row: Row];

/** What one source document becomes: rows in insert order, or why it is left out. */
export type Outcome = { puts: Put[] } | { skip: string };

export const put = (...puts: Put[]): Outcome => ({ puts });

export const skip = (reason: string): Outcome => ({ skip: reason });

type Column = { json: boolean; array: boolean };

/** Postgres classes 22 (data) and 23 (constraints): the row is wrong, not the run. */
const isRefusal = (error: unknown): error is DatabaseError =>
  error instanceof DatabaseError && /^2[23]/.test(error.code ?? '');

const reasonOf = (error: DatabaseError) =>
  error.constraint
    ? `refused by ${error.constraint}`
    : `refused: ${error.message.replace(/"[^"]*"/g, '…').slice(0, 120)}`;

type Pending = { source: string; id: string; row: Row };

export class Writer {
  readonly #client: PoolClient;
  readonly #report: Report;
  readonly #orgId: string;
  readonly #columns = new Map<string, Map<string, Column>>();
  readonly #pending = new Map<string, Pending[]>();

  constructor(client: PoolClient, report: Report, orgId: string) {
    this.#client = client;
    this.#report = report;
    this.#orgId = orgId;
  }

  async #describe(table: string) {
    const known = this.#columns.get(table);

    if (known) return known;

    const { rows } = await this.#client.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );

    if (rows.length === 0) throw new Error(`No table ${table}: run the plugin's migrations first`);

    const columns = new Map(
      rows.map(({ column_name: name, data_type: type }) => [
        name,
        { json: type === 'jsonb' || type === 'json', array: type === 'ARRAY' },
      ]),
    );

    this.#columns.set(table, columns);

    return columns;
  }

  /** Queues the document's rows; a table's queue goes out once it holds a batch. */
  async add(source: string, id: string, puts: Put[]) {
    for (const [table, row] of puts) {
      const queue = this.#pending.get(table) ?? [];

      queue.push({ source, id, row });
      this.#pending.set(table, queue);
    }

    if ([...this.#pending.values()].some((queue) => queue.length >= BATCH)) await this.flush();
  }

  /** Sends every queued row in the order its table first came, so parents go before children. */
  async flush() {
    for (const table of this.#pending.keys()) await this.#flushTable(table);
  }

  async #flushTable(table: string) {
    const queue = this.#pending.get(table) ?? [];

    this.#pending.set(table, []);

    for (let start = 0; start < queue.length; start += BATCH)
      await this.#write(table, queue.slice(start, start + BATCH));
  }

  async #write(table: string, rows: Pending[]) {
    if (rows.length === 0) return;

    try {
      const inserted = await this.#guarded(() => this.#insert(table, rows));

      // A source's rows are flushed before the next source starts, so a batch has one source.
      this.#report.inserted(rows[0]?.source ?? '', table, rows.length, inserted);
    } catch (error) {
      if (!isRefusal(error)) throw error;

      // Halves, not single rows: each try is a round trip, and the database may sit behind a tunnel.
      if (rows.length > 1) {
        const half = Math.ceil(rows.length / 2);

        await this.#write(table, rows.slice(0, half));
        await this.#write(table, rows.slice(half));

        return;
      }

      const [only] = rows;

      if (only) this.#report.refused(only.source, table, only.id, reasonOf(error));
    }
  }

  async #guarded<T>(work: () => Promise<T>) {
    await this.#client.query('SAVEPOINT batch');

    try {
      const result = await work();

      await this.#client.query('RELEASE SAVEPOINT batch');

      return result;
    } catch (error) {
      await this.#client.query('ROLLBACK TO SAVEPOINT batch');
      throw error;
    }
  }

  async #insert(table: string, rows: Pending[]) {
    const columns = await this.#describe(table);
    // Every row is the organisation's; `frontline_public_keys` names it in `org_of` instead.
    const orgColumn = columns.has('org_id') ? ['org_id'] : [];
    const names = [...new Set([...orgColumn, ...rows.flatMap(({ row }) => Object.keys(row))])];

    for (const name of names)
      if (!columns.has(name)) throw new Error(`The import names no column ${table}.${name}`);

    const params: unknown[] = [];

    const tuples = rows.map(({ row }) => {
      const cells = names.map((name) => {
        const value = name === 'org_id' ? (row[name] ?? this.#orgId) : row[name];

        if (value === undefined) return 'DEFAULT';

        const column = columns.get(name);

        params.push(column?.json && value !== null ? JSON.stringify(value) : value);

        return `$${params.length}`;
      });

      return `(${cells.join(', ')})`;
    });

    const result = await this.#client.query(
      `INSERT INTO "${table}" (${names.map((name) => `"${name}"`).join(', ')})
       VALUES ${tuples.join(', ')} ON CONFLICT DO NOTHING`,
      params,
    );

    return result.rowCount ?? 0;
  }
}
