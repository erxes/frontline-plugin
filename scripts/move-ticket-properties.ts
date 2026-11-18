// Makes one organisation's ticket properties core's custom fields on `frontline.ticket`, then
// rewrites its tickets' values to the new field ids.
//
//   CORE_URL=https://… CORE_API_KEY=<an owner's API key> DATA_URL=postgres://… ORG_ID=<core org id> \
//     [MONGO_URL=mongodb://…] pnpm migrate:ticket-properties
//
// It reads the plugin's retired `frontline_ticket_properties` rows and, with MONGO_URL, the old
// erxes `properties_fields` of `frontline:ticket`, whose ids imported tickets hold their values
// by. A property limited to pipelines lands in a group limited to them, the rest in their old
// group or "Tickets". A field core already has by that label is reused, so running it again
// moves nothing twice. Moved rows leave `frontline_ticket_properties`.
import { CORE_API_PREFIX, coreContract, FieldType } from '@erxes/core-contract';
import { createORPCClient } from '@orpc/client';
import type { ContractRouterClient } from '@orpc/contract';
import { OpenAPILink } from '@orpc/openapi-client/fetch';
import { MongoClient } from 'mongodb';
import { type PoolClient, Pool } from 'pg';

const { CORE_URL, CORE_API_KEY, DATA_URL, ORG_ID, MONGO_URL } = process.env;

if (!CORE_URL || !CORE_API_KEY || !DATA_URL || !ORG_ID) {
  console.error('Set CORE_URL, CORE_API_KEY, DATA_URL and ORG_ID, and MONGO_URL for old erxes.');
  process.exit(1);
}

const CONTENT_TYPE = 'frontline.ticket';

const core: ContractRouterClient<typeof coreContract> = createORPCClient(
  new OpenAPILink(coreContract, {
    url: `${CORE_URL}${CORE_API_PREFIX}`,
    headers: { authorization: `Bearer ${CORE_API_KEY}` },
  }),
);

/** A property to make in core, and how its old values read as core's. */
type Old = {
  id: string;
  label: string;
  description: string | null;
  type: ReturnType<typeof typeOf>;
  /** Each choice's stored value and the label core keeps as the option. */
  options: { value: string; label: string }[];
  isVisible: boolean;
  group: string;
  pipelineIds: string[];
};

/** Core's type of the same name, any case; text for one core lacks. */
const typeOf = (type: string) => FieldType.safeParse(type.toLowerCase()).data ?? 'text';

/** Runs `work` in one transaction of the organisation, as its row-level security asks. */
const inOrg = async <T>(pool: Pool, work: (client: PoolClient) => Promise<T>) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.org_id', $1, true)", [ORG_ID]);

    const result = await work(client);

    await client.query('COMMIT');

    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/** The plugin's own properties, each limited group named by its pipelines. */
const pluginProperties = (client: PoolClient) =>
  client
    .query<{
      id: string;
      label: string;
      description: string | null;
      type: string;
      options: string[];
      pipeline_ids: string[];
      pipelines: string | null;
    }>(
      `select p.id, p.label, p.description, p.type, p.options, p.pipeline_ids,
         (select string_agg(name, ', ' order by name) from frontline_pipelines
           where id = any(p.pipeline_ids)) as pipelines
       from frontline_ticket_properties p order by p."order", p.created_at`,
    )
    .then(({ rows }) =>
      rows.map((row): Old => ({
        id: row.id,
        label: row.label,
        description: row.description,
        type: typeOf(row.type),
        options: row.options.map((option) => ({ value: option, label: option })),
        isVisible: true,
        group: row.pipelines ? `Tickets: ${row.pipelines}` : 'Tickets',
        pipelineIds: row.pipeline_ids,
      })),
    );

type MongoField = {
  id: string;
  name?: string;
  description?: string;
  type?: string;
  groupId?: string;
  isVisible?: boolean;
  options?: { label?: string; value?: string }[];
};

/** Old erxes's ticket fields, in their groups' names. Each id becomes a plain `id`. */
const mongoProperties = async (url: string) => {
  const mongo = await MongoClient.connect(url);

  try {
    const db = mongo.db();
    const live = { $match: { contentType: 'frontline:ticket', archivedAt: null } };
    const withId = { $set: { id: { $toString: '$_id' } } };

    const groups = await db
      .collection('properties_groups')
      .aggregate<{ id: string; name: string }>([live, withId])
      .toArray();

    const fields = await db
      .collection('properties_fields')
      .aggregate<MongoField>([live, withId])
      .toArray();

    const groupName = new Map(groups.map((group) => [group.id, group.name]));

    return fields.map((field): Old => ({
      id: field.id,
      label: field.name ?? field.id,
      description: field.description ?? null,
      type: typeOf(field.type ?? 'text'),
      options: (field.options ?? []).flatMap(({ label, value }) =>
        value ? [{ value, label: label || value }] : [],
      ),
      isVisible: field.isVisible ?? true,
      group: groupName.get(field.groupId ?? '') ?? 'Tickets',
      pipelineIds: [],
    }));
  } finally {
    await mongo.close();
  }
};

/** Makes each property's group and field in core, or finds them by name; old id → new field. */
const makeInCore = async (properties: Old[]) => {
  const input = { contentType: CONTENT_TYPE } as const;
  const groups = (await core.fieldGroups.list(input)).data;
  const fields = (await core.fields.list(input)).data;
  const made = new Map<string, string>();

  for (const property of properties) {
    const groupKey = property.group.toLowerCase();

    let group = groups.find((one) => one.name.toLowerCase() === groupKey);

    if (!group) {
      group = await core.fieldGroups.create({
        ...input,
        name: property.group,
        appliesTo: property.pipelineIds.length > 0 ? { pipeline: property.pipelineIds } : {},
      });
      groups.push(group);
    }

    let field = fields.find((one) => one.label.toLowerCase() === property.label.toLowerCase());

    if (!field) {
      field = await core.fields.create({
        ...input,
        groupId: group.id,
        label: property.label,
        description: property.description,
        type: property.type,
        options: [...new Set(property.options.map((option) => option.label))],
        isVisible: property.isVisible,
      });
      fields.push(field);
    }

    made.set(property.id, field.id);
  }

  return made;
};

/** A stored value as core keeps it: a choice by its label, a day as `YYYY-MM-DD`. */
const valueOf = (property: Old, value: unknown): unknown => {
  const label = (one: unknown) =>
    property.options.find((option) => option.value === one)?.label ?? one;

  if (Array.isArray(value)) return value.map(label);

  if (property.type === 'date' && typeof value === 'string') return value.slice(0, 10);

  return label(value);
};

/** Rewrites the tickets holding old ids to the new ones, and drops the moved plugin rows. */
const rewriteTickets = (client: PoolClient, properties: Old[], made: Map<string, string>) => {
  const byId = new Map(properties.map((property) => [property.id, property]));
  const oldIds = [...made.keys()];

  return client
    .query<{ id: string; properties_data: Record<string, unknown> }>(
      'select id, properties_data from frontline_tickets where properties_data ?| $1::text[]',
      [oldIds],
    )
    .then(async ({ rows }) => {
      for (const row of rows) {
        const values = Object.fromEntries(
          Object.entries(row.properties_data).map(([key, value]) => {
            const property = byId.get(key);

            return property ? [made.get(key) ?? key, valueOf(property, value)] : [key, value];
          }),
        );

        await client.query('update frontline_tickets set properties_data = $2 where id = $1', [
          row.id,
          JSON.stringify(values),
        ]);
      }

      await client.query('delete from frontline_ticket_properties where id = any($1::text[])', [
        oldIds,
      ]);

      return rows.length;
    });
};

const pool = new Pool({ connectionString: DATA_URL });

try {
  const properties = [
    ...(await inOrg(pool, pluginProperties)),
    ...(MONGO_URL ? await mongoProperties(MONGO_URL) : []),
  ];

  const made = await makeInCore(properties);
  const tickets = await inOrg(pool, (client) => rewriteTickets(client, properties, made));

  console.info(`${made.size} properties are core fields; ${tickets} tickets rewritten`);
} finally {
  await pool.end();
}
