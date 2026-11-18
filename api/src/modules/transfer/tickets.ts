import type { PluginExportRequest } from '@erxes/core-contract';
import { ORPCError } from '@orpc/server';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { type Tx, withOrg } from '#/db/client.ts';
import { channelMembers, channels } from '#/db/schema.ts';
import { tags } from '#/db/tags.ts';
import { pipelines, pipelineStatuses, PRIORITY_NAMES, tickets } from '#/db/tickets.ts';
import { membership } from '../channels/access.ts';
import { orderOf } from '../paging.ts';
import { pipelineFor } from '../pipelines/pipelines.ts';
import { updateTicket } from '../tickets/changes.ts';
import { propertyFilter } from '../tickets/properties.ts';
import { seenBy } from '../tickets/shared.ts';
import { fileTicket, ticketsMatching } from '../tickets/tickets.ts';
import { customersByEmail, membersByEmail, namesOf } from './people.ts';
import { dateOf, type ImportRequest, listOf, rowOf, runImport, transferMember } from './shared.ts';

type Member = ReturnType<typeof transferMember>;

/** Tickets' columns in core's import and export; `id` finds the ticket an import updates. */
export const TICKET_COLUMNS = [
  { key: 'id', label: 'ID', default: false },
  { key: 'number', label: 'Number', importable: false },
  { key: 'name', label: 'Name', aliases: ['Title', 'Subject', 'Нэр'] },
  { key: 'description', label: 'Description', aliases: ['Тайлбар'] },
  { key: 'pipeline', label: 'Pipeline', aliases: ['Board'] },
  { key: 'status', label: 'Status', aliases: ['Stage', 'Төлөв'] },
  { key: 'channel', label: 'Channel', importable: false },
  { key: 'priority', label: 'Priority' },
  { key: 'assignee', label: 'Assignee', aliases: ['Assigned to'] },
  { key: 'members', label: 'Assigned members' },
  { key: 'tags', label: 'Tags' },
  { key: 'customer', label: 'Customer', aliases: ['Customer email'] },
  { key: 'company', label: 'Company', importable: false },
  { key: 'startDate', label: 'Start date' },
  { key: 'targetDate', label: 'Due date', aliases: ['Target date', 'Close date'] },
  { key: 'state', label: 'State', importable: false, default: false },
  { key: 'createdAt', label: 'Created', importable: false },
  { key: 'updatedAt', label: 'Updated', importable: false, default: false },
];

/** A description as text: the words of erxes-ui's editor blocks, or the text a visitor sent. */
const textOf = (description: string) => {
  const words = (node: unknown): string[] => {
    if (Array.isArray(node)) return node.flatMap(words);

    if (typeof node !== 'object' || node === null) return [];

    const text = 'text' in node && typeof node.text === 'string' ? [node.text] : [];
    const content = 'content' in node ? words(node.content) : [];
    const children = 'children' in node ? words(node.children) : [];

    return [[...text, ...content].join(''), ...children].filter(Boolean);
  };

  try {
    const blocks: unknown = JSON.parse(description);

    return Array.isArray(blocks) ? words(blocks).join('\n') : description;
  } catch {
    return description;
  }
};

/** A page of the tickets the member sees, oldest first, narrowed as their list narrows them. */
export const exportTickets = async (request: z.infer<typeof PluginExportRequest>) => {
  const member = transferMember(request.orgId, request.userId);
  const order = orderOf(tickets, tickets.createdAt, true);
  const fromCore = await propertyFilter(request.orgId, request.query.filter ?? undefined);

  const { items, nextCursor } = await withOrg(request.orgId, async (tx) => {
    const rows = await tx
      .select({
        id: tickets.id,
        number: tickets.number,
        name: tickets.name,
        description: tickets.description,
        pipeline: pipelines.name,
        status: pipelineStatuses.name,
        channel: channels.name,
        priority: tickets.priority,
        assigneeId: tickets.assigneeId,
        memberIds: tickets.assignedMemberIds,
        tags: sql<string[]>`array(
          select ${tags.name} from ${tags} where ${tags.id} = any(${tickets.tagIds}) order by ${tags.name}
        )`,
        customerId: tickets.customerId,
        companyId: tickets.companyId,
        startDate: tickets.startDate,
        targetDate: tickets.targetDate,
        state: tickets.state,
        createdAt: tickets.createdAt,
        updatedAt: tickets.updatedAt,
      })
      .from(tickets)
      .innerJoin(pipelineStatuses, eq(pipelineStatuses.id, tickets.statusId))
      .innerJoin(pipelines, eq(pipelines.id, tickets.pipelineId))
      .innerJoin(channels, eq(channels.id, tickets.channelId))
      .leftJoin(channelMembers, membership(member, tickets.channelId))
      .where(
        and(
          ticketsMatching(member, request.query, fromCore),
          order.after(request.cursor ?? undefined),
        ),
      )
      .orderBy(...order.orderBy)
      .limit(request.limit + 1);

    return order.page(tx, rows, request.limit);
  });

  const nameOf = await namesOf(request.orgId, {
    users: items.flatMap((row) => [row.assigneeId ?? [], row.memberIds].flat()),
    customers: items.flatMap((row) => row.customerId ?? []),
    companies: items.flatMap((row) => row.companyId ?? []),
  });

  return {
    cursor: nextCursor,
    rows: items.map(({ assigneeId, memberIds, customerId, companyId, ...row }) =>
      rowOf(request.columns, {
        ...row,
        description: textOf(row.description),
        priority: PRIORITY_NAMES[row.priority] ?? null,
        assignee: nameOf(assigneeId),
        members: memberIds.map((id) => nameOf(id) ?? id),
        customer: nameOf(customerId),
        company: nameOf(companyId),
        startDate: row.startDate?.toISOString() ?? null,
        targetDate: row.targetDate?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }),
    ),
  };
};

const refuse = (message: string) => new ORPCError('BAD_REQUEST', { message });

/** A priority cell: its name in any case, or its number. */
const priorityOf = (cell: string) => {
  const at = PRIORITY_NAMES.findIndex((name) => name.toLowerCase() === cell.toLowerCase());
  const priority = at >= 0 ? at : Number(cell);

  if (!PRIORITY_NAMES[priority]) throw refuse(`Priority is one of ${PRIORITY_NAMES.join(', ')}`);

  return priority;
};

type Row = Record<string, string>;

/** The ticket the row's ID names, among those the member sees. */
const ticketOfRow = async (tx: Tx, member: Member, row: Row) => {
  if (!row.id) return undefined;

  const [found] = await tx
    .select({ id: tickets.id, pipelineId: tickets.pipelineId })
    .from(tickets)
    .leftJoin(channelMembers, membership(member, tickets.channelId))
    .where(and(eq(tickets.id, row.id), seenBy(member)));

  return found;
};

/** The pipeline of the row, by name or id; a ticket it updates stays in its own. */
const pipelineOfRow = async (tx: Tx, row: Row, found: { pipelineId: string } | undefined) => {
  const cell = row.pipeline;

  const named = cell
    ? await tx
        .select({ id: pipelines.id })
        .from(pipelines)
        .where(sql`${pipelines.id} = ${cell} or lower(${pipelines.name}) = lower(${cell})`)
    : [];

  if (named.length > 1) throw refuse(`${named.length} pipelines are named ${cell}; use its ID`);

  const [match] = named;

  if (found && match && match.id !== found.pipelineId)
    throw refuse('Move a ticket to another pipeline in frontline');

  const id = found?.pipelineId ?? match?.id;

  if (!id) throw refuse(cell ? `No pipeline ${cell}` : 'Pipeline is required');

  return id;
};

/** The status the row names in the pipeline, or undefined for none. */
const statusOfRow = async (tx: Tx, pipelineId: string, cell: string | undefined) => {
  if (!cell) return undefined;

  const [status] = await tx
    .select({ id: pipelineStatuses.id })
    .from(pipelineStatuses)
    .where(
      and(
        eq(pipelineStatuses.pipelineId, pipelineId),
        sql`lower(${pipelineStatuses.name}) = lower(${cell})`,
      ),
    );

  if (!status) throw refuse(`The pipeline has no status ${cell}`);

  return status.id;
};

/** The ticket tags the cell names; each must exist. */
const tagIdsOf = async (tx: Tx, cell: string | undefined) => {
  const names = listOf(cell).map((name) => name.toLowerCase());

  if (!names.length) return undefined;

  const found = await tx
    .select({ id: tags.id, name: sql<string>`lower(${tags.name})` })
    .from(tags)
    .where(and(eq(tags.type, 'ticket'), inArray(sql`lower(${tags.name})`, names)));

  const missing = names.find((name) => !found.some((tag) => tag.name === name));

  if (missing) throw refuse(`No ticket tag ${missing}`);

  return found.map((tag) => tag.id);
};

/**
 * Files or updates a ticket for each row, as the member would in frontline. `id` names the
 * ticket to update; a new one needs a name and a pipeline, by name or id, and takes its first
 * status unless the row names one. People are named by email: a member must exist, a customer
 * is made in core when it has none (not in a check).
 */
export const importTickets = async (request: ImportRequest) => {
  const member = transferMember(request.orgId, request.userId);
  const cells = request.rows.map((row) => row.values);

  const people = await membersByEmail(
    request.orgId,
    cells.flatMap((row) => [row.assignee ?? [], listOf(row.members)].flat()),
  );

  const customers = request.dryRun
    ? new Map<string, string>()
    : await customersByEmail(
        request.orgId,
        cells.flatMap((row) => row.customer ?? []),
      );

  const personOf = (email: string) => {
    const id = people.get(email.toLowerCase());

    if (!id) throw refuse(`No team member has the email ${email}`);

    return id;
  };

  return runImport(request, async (tx, row) => {
    const found = await ticketOfRow(tx, member, row);

    if (found ? request.mode === 'create' : request.mode === 'update')
      return { action: 'skip', recordId: found?.id };

    const pipelineId = await pipelineOfRow(tx, row, found);
    const statusId = await statusOfRow(tx, pipelineId, row.status);
    const tagIds = await tagIdsOf(tx, row.tags);

    const values = {
      ...(row.name ? { name: row.name } : {}),
      ...(row.description ? { description: row.description } : {}),
      ...(row.priority ? { priority: priorityOf(row.priority) } : {}),
      ...(row.assignee ? { assigneeId: personOf(row.assignee) } : {}),
      ...(row.members ? { assignedMemberIds: listOf(row.members).map(personOf) } : {}),
      ...(tagIds ? { tagIds } : {}),
      ...(row.customer ? { customerId: customers.get(row.customer.toLowerCase()) } : {}),
      ...(row.startDate ? { startDate: dateOf(row.startDate, 'Start date') } : {}),
      ...(row.targetDate ? { targetDate: dateOf(row.targetDate, 'Due date') } : {}),
    };

    if (found) {
      await updateTicket(tx, member, { id: found.id, ...values, statusId });

      return { action: 'update', recordId: found.id };
    }

    if (!values.name) throw refuse('Name is required');

    const pipeline = await pipelineFor(tx, member, pipelineId, { change: false });

    const recordId = await fileTicket(tx, member, pipeline, {
      ...values,
      name: values.name,
      statusId,
      propertiesData: {},
    });

    return { action: 'create', recordId };
  });
};
