import { CustomFieldsPatch, type FieldLogic, groupApplies } from '@erxes/core-contract';
import { ORPCError } from '@orpc/server';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { core, TICKET_TIMELINE } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { tags } from '#/db/tags.ts';
import { ticketComments } from '#/db/ticketComments.ts';
import { pipelineStatuses, pipelines, tickets } from '#/db/tickets.ts';
import { logger } from '#/logger.ts';
import type { LogicOperator } from '../forms/logic.ts';
import { checkProperties } from '../tickets/properties.ts';
import { fileTicket } from '../tickets/tickets.ts';
import { attachmentsOf, type Visitor } from './session.ts';
import { asVisitor, messengerIntegration } from './threads.ts';

/** The visitor's messenger, or NOT_FOUND once it is gone or switched off. */
const openMessenger = async (visitor: Visitor) => {
  const settings = await messengerIntegration(visitor.orgId, visitor.integrationId);

  if (!settings) throw new ORPCError('NOT_FOUND', { message: 'No such messenger' });

  return settings;
};

type Settings = Awaited<ReturnType<typeof openMessenger>>;

/** The pipelines a messenger takes tickets in: the public ones it picks, of its own channel. */
const offered = (tx: Tx, settings: Settings) =>
  tx
    .select({ id: pipelines.id, name: pipelines.name, channelId: pipelines.channelId })
    .from(pipelines)
    .where(
      and(
        eq(pipelines.channelId, settings.channelId),
        inArray(pipelines.id, settings.ticketPipelineIds),
        eq(pipelines.visibility, 'public'),
      ),
    )
    .orderBy(asc(pipelines.name));

/** How the messenger draws each type of core's fields; it offers no other. */
const WIDGET_TYPES = {
  text: 'text',
  phone: 'text',
  textarea: 'textarea',
  number: 'number',
  date: 'date',
  boolean: 'boolean',
  select: 'select',
  radio: 'select',
  multiselect: 'multiselect',
  check: 'multiselect',
} as const;

const isWidgetType = (type: string): type is keyof typeof WIDGET_TYPES => type in WIDGET_TYPES;

/** Each of core's Logic operators, as the form embed's rules (`../forms/logic.ts`) name it. */
const OPERATORS = {
  is: 'is',
  isNot: 'isNot',
  contains: 'contains',
  greaterThan: 'greaterThan',
  lessThan: 'lessThan',
  isEmpty: 'isUnknown',
  hasValue: 'hasAnyValue',
} as const satisfies Record<FieldLogic['rules'][number]['operator'], LogicOperator>;

/** A core field's Logic as a form field's, so the widget shows both with one `isShown`. */
const logicOf = (logic: FieldLogic | null) => ({
  logicAction: logic?.action ?? null,
  logics: (logic?.rules ?? []).map(({ fieldId, operator, value }) => ({
    fieldId,
    operator: OPERATORS[operator],
    value: value ?? undefined,
  })),
});

/**
 * The ticket fields core shows on a new ticket, each with the groups that say which pipelines
 * show it, and its Required and Logic rules. A visitor can still file a ticket while core can't
 * answer, with no fields to fill in.
 */
const ticketFields = async (orgId: string) => {
  const client = core.forOrg(orgId);

  try {
    const [fields, groups] = await Promise.all([
      client.fields.list({ contentType: TICKET_TIMELINE }),
      client.fieldGroups.list({ contentType: TICKET_TIMELINE }),
    ]);

    const appliesTo = new Map(groups.data.map((group) => [group.id, group.appliesTo]));

    return fields.data.flatMap((field) =>
      field.isVisible && field.isVisibleToCreate && isWidgetType(field.type)
        ? [
            {
              id: field.id,
              label: field.label,
              description: field.description,
              type: WIDGET_TYPES[field.type],
              options: field.options,
              isRequired: field.isRequired,
              ...logicOf(field.logic),
              appliesTo: appliesTo.get(field.groupId ?? '') ?? {},
            },
          ]
        : [],
    );
  } catch (error) {
    logger.warn({ err: error, orgId }, 'ticket fields unavailable for the messenger');

    return [];
  }
};

/** What the visitor fills in to file a ticket: each pipeline with its fields, and the tags. */
const formsOf = async (
  tx: Tx,
  settings: Settings,
  fields: Awaited<ReturnType<typeof ticketFields>>,
) => {
  const forms = (await offered(tx, settings)).map(({ id, name }) => ({
    id,
    name,
    properties: fields
      .filter((field) => groupApplies(field.appliesTo, { pipeline: [id] }))
      .map(({ appliesTo, ...field }) => field),
  }));

  const ticketTags = await tx
    .select({ id: tags.id, name: tags.name, colorCode: tags.colorCode })
    .from(tags)
    .where(eq(tags.type, 'ticket'))
    .orderBy(asc(tags.name));

  return { pipelines: forms, tags: ticketTags };
};

/** The ticket forms, as `/tickets/forms` answers them. */
export type TicketForms = Awaited<ReturnType<typeof formsOf>>;

const ticketForms = asVisitor(async (visitor, _req, res) => {
  const settings = await openMessenger(visitor);
  const fields = await ticketFields(visitor.orgId);

  res.json(await withOrg(visitor.orgId, (tx) => formsOf(tx, settings, fields)));
});

/**
 * What the team wrote to the visitor on the ticket, oldest first: only `frontline_ticket_comments`,
 * never core's notes, which are the team's own. The old app showed the visitor every note.
 */
const commentsOf = sql<{ id: string; body: string; createdAt: string }[]>`coalesce((
  select jsonb_agg(jsonb_build_object('id', said.id, 'body', said.body, 'createdAt', said.created_at)
    order by said.created_at, said.id)
  from ${ticketComments} said
  where said.ticket_id = ${tickets}.id
), '[]'::jsonb)`;

/** The visitor's tickets through this messenger's channel, newest first, with no member's ids. */
const ticketsOf = (tx: Tx, visitor: Visitor, channelId: string, id?: string) =>
  tx
    .select({
      id: tickets.id,
      number: tickets.number,
      name: tickets.name,
      description: tickets.description,
      attachments: tickets.attachments,
      pipeline: pipelines.name,
      status: pipelineStatuses.name,
      statusType: pipelineStatuses.type,
      statusChangedAt: tickets.statusChangedAt,
      createdAt: tickets.createdAt,
      comments: commentsOf,
    })
    .from(tickets)
    .innerJoin(pipelines, eq(pipelines.id, tickets.pipelineId))
    .innerJoin(pipelineStatuses, eq(pipelineStatuses.id, tickets.statusId))
    .where(
      and(
        eq(tickets.customerId, visitor.customerId),
        eq(tickets.channelId, channelId),
        eq(tickets.state, 'active'),
        id ? eq(tickets.id, id) : undefined,
      ),
    )
    .orderBy(desc(tickets.createdAt))
    .limit(50);

/** A ticket as the visitor sees it. */
export type VisitorTicket = Awaited<ReturnType<typeof ticketsOf>>[number];

const listTickets = asVisitor(async (visitor, _req, res) => {
  const { channelId } = await openMessenger(visitor);

  res.json(await withOrg(visitor.orgId, (tx) => ticketsOf(tx, visitor, channelId)));
});

const File = z.object({
  pipelineId: z.string(),
  name: z.string().trim().min(1, 'Name the ticket').max(500),
  description: z.string().trim().max(10_000).default(''),
  /** The receipts `/files` gave for the visitor's uploads. */
  files: z.array(z.string().max(4000)).max(20).default([]),
  tagIds: z.array(z.string()).max(20).default([]),
  propertiesData: CustomFieldsPatch.default({}),
});

/** A ticket the visitor files, with every field `/tickets` defaults filled in. */
export type VisitorNewTicket = z.output<typeof File>;

/**
 * The visitor files a ticket in a pipeline their messenger offers, as its customer. The team
 * reaches them by the email or phone they left, so a visitor leaves one first.
 */
const createTicket = asVisitor(async (visitor, req, res) => {
  const { pipelineId, files, propertiesData, ...input } = File.parse(req.body);

  if (!visitor.identified)
    throw new ORPCError('FORBIDDEN', { message: 'Leave your email or phone number first' });

  const attachments = await attachmentsOf(visitor, files);
  const settings = await openMessenger(visitor);
  const properties = await checkProperties(visitor.orgId, pipelineId, {}, propertiesData);

  const filed = await withOrg(visitor.orgId, async (tx) => {
    const pipeline = (await offered(tx, settings)).find((offer) => offer.id === pipelineId);

    if (!pipeline) throw new ORPCError('BAD_REQUEST', { message: 'Pick a ticket form' });

    const id = await fileTicket(tx, { orgId: visitor.orgId, userId: null }, pipeline, {
      ...input,
      propertiesData: properties,
      attachments,
      customerId: visitor.customerId,
    });

    const [ticket] = await ticketsOf(tx, visitor, pipeline.channelId, id);

    return ticket;
  });

  res.status(201).json(filed);
});

/** The messenger's ticket routes, under `/api/public/messenger/tickets`. */
export const ticketRoutes = { ticketForms, listTickets, createTicket };
