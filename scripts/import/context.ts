// What every step shares: the organisation, the old Mongo databases, core's id map, and the
// ids earlier steps gave, so a later step finds the new parent of an old record.
import type { Db, Document } from 'mongodb';
import type { PoolClient } from 'pg';
import type { Report } from './report.ts';
import type { Writer } from './engine.ts';

/** Core's id map, created by core's importer; made here too, the same, when it isn't yet. */
const ID_MAP_DDL = `
  create schema if not exists officenext_import;
  create table if not exists officenext_import.id_map (
    kind text not null, old_id text not null, new_id text not null, primary key (kind, old_id)
  )`;

/** The kinds core's importer maps; a plugin reads them, never writes them. */
type CoreKind = 'user' | 'customer' | 'company' | 'field';

export type Integration = { id: string; channelId: string; kind: string };

export class Context {
  readonly orgId: string;
  readonly client: PoolClient;
  readonly writer: Writer;
  readonly report: Report;
  readonly main: Db;
  readonly office: Db;
  readonly officeIntegrations: Db;
  readonly limit: number | undefined;

  /** Core's merged ids: an old record that became an existing row has that row's id. */
  readonly #core = new Map<CoreKind, Map<string, string>>();

  /** The row each old record became, by kind: its own id, or the target's row it merged into. */
  readonly #merged = new Map<string, Map<string, string>>();

  /** The new integration of each old one, by old id. */
  readonly integrations = new Map<string, Integration>();

  /** The conversations a step queued, by old id, with their old integration, its kind and customer. */
  readonly conversations = new Map<string, { kind: string; customerId: string; inboxId: string }>();

  /** The member who owns rows the import makes itself, such as the fallback channel. */
  owner = '';

  constructor(init: {
    orgId: string;
    client: PoolClient;
    writer: Writer;
    report: Report;
    main: Db;
    office: Db;
    officeIntegrations: Db;
    limit: number | undefined;
  }) {
    this.orgId = init.orgId;
    this.client = init.client;
    this.writer = init.writer;
    this.report = init.report;
    this.main = init.main;
    this.office = init.office;
    this.officeIntegrations = init.officeIntegrations;
    this.limit = init.limit;
  }

  async loadIdMap() {
    await this.client.query(ID_MAP_DDL);

    const { rows } = await this.client.query<{ kind: CoreKind; old_id: string; new_id: string }>(
      `SELECT kind, old_id, new_id FROM officenext_import.id_map
       WHERE kind = ANY($1) AND old_id <> new_id`,
      [['user', 'customer', 'company', 'field']],
    );

    for (const { kind, old_id: oldId, new_id: newId } of rows) {
      const map = this.#core.get(kind) ?? new Map<string, string>();

      map.set(oldId, newId);
      this.#core.set(kind, map);
    }

    return rows.length;
  }

  #resolve(kind: CoreKind, id: string | null) {
    return id === null ? null : (this.#core.get(kind)?.get(id) ?? id);
  }

  user = (id: string | null) => this.#resolve('user', id);

  customer = (id: string | null) => this.#resolve('customer', id);

  company = (id: string | null) => this.#resolve('company', id);

  field = (id: string | null) => this.#resolve('field', id);

  users = (ids: string[]) => [...new Set(ids.map((id) => this.user(id) ?? id))];

  /**
   * Records that old record `oldId` of `kind` is row `newId`: its own id when it was queued, or
   * the target's row it merged into.
   */
  remember(kind: string, oldId: string, newId: string) {
    const map = this.#merged.get(kind) ?? new Map<string, string>();

    map.set(oldId, newId);
    this.#merged.set(kind, map);
  }

  /** The row an old channel, tag, form or other record became, or undefined if none. */
  known(kind: string, oldId: string | null) {
    return oldId === null ? undefined : this.#merged.get(kind)?.get(oldId);
  }

  /** The rows old ids became, leaving out the ones that became none. */
  knownAll(kind: string, oldIds: string[]) {
    return [...new Set(oldIds.flatMap((id) => this.known(kind, id) ?? []))];
  }

  /** The target's rows of `table` keyed by `key` (an SQL expression), to merge old records into. */
  async keyed(table: string, key: string) {
    const { rows } = await this.client.query<{ id: string; key: string | null }>(
      `SELECT id, ${key} AS key FROM "${table}"`,
    );

    return new Map(rows.flatMap(({ id, key: value }) => (value === null ? [] : [[value, id]])));
  }

  /** The documents of `collection`, at most `--limit` while developing. */
  find(db: Db, collection: string, filter: Document = {}) {
    const cursor = db.collection(collection).find(filter, { batchSize: 1000 });

    return this.limit ? cursor.limit(this.limit) : cursor;
  }
}
