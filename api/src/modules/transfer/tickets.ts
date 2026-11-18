import type { PluginExportRequest } from '@erxes/core-contract';
import { and, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { withOrg } from '#/db/client.ts';
import { channelMembers, channels } from '#/db/schema.ts';
import { tags } from '#/db/tags.ts';
import { pipelines, pipelineStatuses, PRIORITY_NAMES, tickets } from '#/db/tickets.ts';
import { membership } from '../channels/access.ts';
import { orderOf } from '../paging.ts';
import { pipelineFor } from '../pipelines/pipelines.ts';
import { updateTicket } from '../tickets/changes.ts';
import { checkProperties, propertyFilter } from '../tickets/properties.ts';
import { fileTicket, ticketsMatching } from '../tickets/tickets.ts';
import { customersOf, membersByEmail, namesOf } from './people.ts';
import { propertyCells, propertyPatchOf, ticketFieldsFor } from './properties.ts';
import {
  dateOf,
  type ImportRequest,
  listOf,
  refuse,
  rowOf,
  runImport,
  transferMember,
} from './shared.ts';
import {
  pipelineOfRow,
  priorityOf,
  stateOf,
  statusOfRow,
  tagIdsOf,
  ticketOfRow,
} from './ticketRows.ts';

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
  { key: 'properties', label: 'Properties', aliases: ['Custom fields'] },
  { key: 'startDate', label: 'Start date' },
  { key: 'targetDate', label: 'Due date', aliases: ['Target date', 'Close date'] },
  { key: 'state', label: 'State', default: false },
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

/**
 * A page of the tickets the member sees, archived ones too, oldest first, narrowed as their list
 * narrows them.
 */
export const exportTickets = async (request: z.infer<typeof PluginExportRequest>) => {
  const member = transferMember(request.orgId, request.userId);
  const order = orderOf(tickets, tickets.createdAt, true);
  const fromCore = await propertyFilter(request.orgId, request.query.filter ?? undefined);
  const fields = await ticketFieldsFor(request.orgId, request.columns.includes('properties'));

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
        properties: tickets.propertiesData,
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
          ticketsMatching(member, { ...request.query, everyState: true }, fromCore),
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
        properties: propertyCells(fields, row.properties),
        startDate: row.startDate?.toISOString() ?? null,
        targetDate: row.targetDate?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }),
    ),
  };
};

/**
 * Files or updates a ticket for each row, as the member would in frontline. `id` names the
 * ticket to update; a new one needs a name and a pipeline, by name or id, and takes its first
 * status unless the row names one. A member is named by email and must exist; a customer by
 * email or phone, made in core when it has none (not in a check). Properties go through core's
 * check, inside the row's transaction with the ticket locked, so a save meanwhile waits. A
 * description stays as it is unless its text changed, so its formatting survives a round trip.
 */
export const importTickets = async (request: ImportRequest) => {
  const member = transferMember(request.orgId, request.userId);
  const cells = request.rows.map((row) => row.values);

  const fields = await ticketFieldsFor(
    request.orgId,
    cells.some((row) => row.properties),
  );

  const people = await membersByEmail(
    request.orgId,
    cells.flatMap((row) => [row.assignee ?? [], listOf(row.members)].flat()),
  );

  const customerOf = await customersOf(
    request.orgId,
    cells.flatMap((row) => row.customer ?? []),
    request.dryRun,
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

    const pipelineId = await pipelineOfRow(tx, member, row.pipeline, found);
    const statusId = await statusOfRow(tx, pipelineId, row.status);
    const tagIds = await tagIdsOf(tx, row.tags);
    const current = found?.properties ?? {};

    const properties = row.properties
      ? await checkProperties(
          request.orgId,
          pipelineId,
          current,
          propertyPatchOf(row.properties, fields, pipelineId),
        )
      : undefined;

    const described = row.description && row.description !== textOf(found?.description ?? '');
    const customerId = row.customer ? customerOf(row.customer, Boolean(found)) : undefined;

    const values = {
      ...(row.name ? { name: row.name } : {}),
      ...(described ? { description: row.description } : {}),
      ...(row.priority ? { priority: priorityOf(row.priority) } : {}),
      ...(row.assignee ? { assigneeId: personOf(row.assignee) } : {}),
      ...(row.members ? { assignedMemberIds: listOf(row.members).map(personOf) } : {}),
      ...(tagIds ? { tagIds } : {}),
      ...(customerId ? { customerId } : {}),
      ...(row.state ? { state: stateOf(row.state) } : {}),
      ...(row.startDate ? { startDate: dateOf(row.startDate, 'Start date') } : {}),
      ...(row.targetDate ? { targetDate: dateOf(row.targetDate, 'Due date') } : {}),
    };

    if (found) {
      await updateTicket(tx, member, { id: found.id, ...values, statusId, properties });

      return { action: 'update', recordId: found.id };
    }

    if (!values.name) throw refuse('Name is required');

    const pipeline = await pipelineFor(tx, member, pipelineId, { change: false });

    const recordId = await fileTicket(tx, member, pipeline, {
      ...values,
      name: values.name,
      statusId,
      propertiesData: properties ?? {},
    });

    return { action: 'create', recordId };
  });
};
