import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';
import { withOrg } from '#/db/client.ts';
import { formSubmissions, forms } from '#/db/forms.ts';
import { CONVERSATION_STATUSES, conversations, integrations } from '#/db/inbox.ts';
import { channels } from '#/db/schema.ts';
import { pipelineStatuses, pipelines, Priority, STATUS_TYPES, tickets } from '#/db/tickets.ts';
import { RELATIONS } from '#/relations.ts';

// Core's customer filter reads these views (the manifest's `relations`) and refuses one whose
// columns don't hold what the manifest says, as Postgres type categories: N, D, S, B.
const CATEGORY = {
  number: 'N',
  date: 'D',
  text: 'S',
  select: 'S',
  boolean: 'B',
  member: 'S',
} as const;

const KINDS = [
  'messenger',
  'facebook',
  'instagram',
  'telegram',
  'discord',
  'mail',
  'call',
  'callpro',
];

const newOrg = () => `org-${crypto.randomUUID()}`;

const columnsOf = async (orgId: string, view: string) =>
  withOrg(orgId, async (tx) => {
    const { rows } = await tx.execute<{ name: string; category: string; granted: boolean }>(sql`
      select a.attname as name, t.typcategory as category,
        has_table_privilege('erxes_core_reader', c.oid, 'SELECT') as granted
      from pg_class c
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      join pg_type t on t.oid = a.atttypid
      where c.relname = ${view} and c.relkind = 'v'`);

    return rows;
  });

const rowsOf = async (orgId: string, view: string) =>
  withOrg(orgId, async (tx) => {
    const { rows } = await tx.execute(sql`select * from ${sql.identifier(view)} order by 1, 2`);

    return rows;
  });

const byText = (a: unknown, b: unknown) => String(a).localeCompare(String(b));

/**
 * For Bat: a conversation through every kind of integration and of every status, a ticket in
 * every stage and of every priority, an archived ticket and one with no customer, and a form
 * submission; a visitor's submission with no customer.
 */
const seed = async (orgId: string) =>
  withOrg(orgId, async (tx) => {
    const by = { orgId, createdBy: 'user' };

    const [channel] = await tx
      .insert(channels)
      .values({ ...by, name: 'Support' })
      .returning({ id: channels.id });

    const channelId = channel?.id ?? '';

    const made = await tx
      .insert(integrations)
      .values(KINDS.map((kind) => ({ ...by, channelId, kind, name: `Our ${kind}` })))
      .returning({ id: integrations.id });

    await tx.insert(conversations).values(
      made.map((integration, i) => ({
        orgId,
        channelId,
        integrationId: integration.id,
        customerId: 'bat',
        status: CONVERSATION_STATUSES[i % CONVERSATION_STATUSES.length],
        messageCount: 2,
      })),
    );

    const [pipeline] = await tx
      .insert(pipelines)
      .values({ ...by, channelId, name: 'Helpdesk' })
      .returning({ id: pipelines.id });

    const pipelineId = pipeline?.id ?? '';

    const statuses = await tx
      .insert(pipelineStatuses)
      .values(
        Object.values(STATUS_TYPES).map((type) => ({
          orgId,
          pipelineId,
          name: `Status ${type}`,
          type,
          order: 0,
        })),
      )
      .returning({ id: pipelineStatuses.id });

    const ticket = (i: number) => ({
      ...by,
      channelId,
      pipelineId,
      statusId: statuses[i % statuses.length]?.id ?? '',
      name: `Ticket ${i}`,
      priority: Priority.parse(i % 5),
      customerId: 'bat',
      assigneeId: 'saraa',
    });

    await tx
      .insert(tickets)
      .values([
        ...statuses.map((_, i) => ticket(i)),
        { ...ticket(0), state: 'archived' as const },
        { ...ticket(0), customerId: null },
      ]);

    const [form] = await tx
      .insert(forms)
      .values({ ...by, channelId, name: 'Contact us', code: `contact-${orgId}` })
      .returning({ id: forms.id });

    await tx.insert(formSubmissions).values([
      { orgId, formId: form?.id ?? '', customerId: 'bat' },
      { orgId, formId: form?.id ?? '' },
    ]);
  });

describe('customer relations: the views core’s customer filter reads', () => {
  it('has record_id and each field as the manifest types it, granted to core', async () => {
    const orgId = newOrg();
    const found: Record<string, Record<string, string | boolean | undefined>> = {};
    const wanted: Record<string, Record<string, string | boolean>> = {};

    for (const relation of RELATIONS) {
      const columns = new Map(
        (await columnsOf(orgId, relation.view)).map((column) => [column.name, column]),
      );

      const keys = ['record_id', ...relation.fields.map((field) => field.key)];

      found[relation.view] = {
        granted: columns.get('record_id')?.granted,
        ...Object.fromEntries(keys.map((key) => [key, columns.get(key)?.category])),
      };
      wanted[relation.view] = {
        granted: true,
        record_id: 'S',
        ...Object.fromEntries(relation.fields.map((field) => [field.key, CATEGORY[field.type]])),
      };
    }

    expect(found).toEqual(wanted);
  });

  it('reads every kind, status, stage and priority as one of the filter’s choices', async () => {
    const orgId = newOrg();
    const seen: Record<string, unknown[]> = {};
    const options: Record<string, string[]> = {};

    await seed(orgId);

    for (const relation of RELATIONS) {
      const rows = await rowsOf(orgId, relation.view);

      for (const field of relation.fields) {
        if (field.type !== 'select') continue;

        const name = `${relation.view}.${field.key}`;

        seen[name] = [...new Set(rows.map((row) => row[field.key]))].toSorted(byText);
        options[name] = [...field.options].toSorted(byText);
      }
    }

    expect(seen).toEqual(options);
  });

  it('keeps to the customers’ records in the organisation core filters', async () => {
    const orgId = newOrg();
    const other = newOrg();

    await seed(orgId);
    await seed(other);

    const conversationsOf = await rowsOf(orgId, 'frontline_customer_conversations');

    expect(conversationsOf).toHaveLength(KINDS.length);
    expect(new Set(conversationsOf.map((row) => row.org_id))).toEqual(new Set([orgId]));
    expect(conversationsOf.find((row) => row.source === 'Email')).toMatchObject({
      record_id: 'bat',
      channel: 'Support',
      integration: 'Our mail',
      messages: 2,
    });
    // A resolved conversation waits on no one.
    expect(
      conversationsOf.filter((row) => row.status === 'Resolved').map((row) => row.awaiting_reply),
    ).not.toContain(true);

    // Archived tickets and tickets without a customer are left out.
    const ticketsOf = await rowsOf(orgId, 'frontline_customer_tickets');

    expect(ticketsOf).toHaveLength(Object.keys(STATUS_TYPES).length);
    expect(ticketsOf[0]).toMatchObject({ record_id: 'bat', pipeline: 'Helpdesk' });

    // A visitor who left no customer isn't one.
    expect(await rowsOf(orgId, 'frontline_customer_form_submissions')).toMatchObject([
      { record_id: 'bat', form: 'Contact us' },
    ]);
  });
});
