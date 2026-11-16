import { ORPCError } from '@orpc/server';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { type Tx, withOrg } from '#/db/client.ts';
import { tags } from '#/db/tags.ts';
import { pipelineStatuses, pipelines, ticketProperties, tickets } from '#/db/tickets.ts';
import { PropertiesPatch } from '../tickets/properties.ts';
import { insertTicket } from '../tickets/tickets.ts';
import { fileOf, type Visitor } from './session.ts';
import { asVisitor, messengerIntegration } from './threads.ts';

/** The visitor's messenger, or NOT_FOUND once it is gone or switched off. */
const openMessenger = async (visitor: Visitor) => {
  const settings = await messengerIntegration(visitor.orgId, visitor.integrationId);

  if (!settings) throw new ORPCError('NOT_FOUND', { message: 'No such messenger' });

  return settings;
};

type Settings = Awaited<ReturnType<typeof openMessenger>>;

/** The pipelines a messenger takes tickets in: those it picks, of its own channel. */
const offered = (tx: Tx, settings: Settings) =>
  tx
    .select({ id: pipelines.id, name: pipelines.name, channelId: pipelines.channelId })
    .from(pipelines)
    .where(
      and(
        eq(pipelines.channelId, settings.channelId),
        inArray(pipelines.id, settings.ticketPipelineIds),
      ),
    )
    .orderBy(asc(pipelines.name));

/** What the visitor fills in to file a ticket: each pipeline with its properties, and the tags. */
const formsOf = async (tx: Tx, settings: Settings) => {
  const properties = await tx
    .select({
      id: ticketProperties.id,
      label: ticketProperties.label,
      description: ticketProperties.description,
      type: ticketProperties.type,
      options: ticketProperties.options,
      isRequired: ticketProperties.isRequired,
      pipelineIds: ticketProperties.pipelineIds,
    })
    .from(ticketProperties)
    .orderBy(asc(ticketProperties.order));

  // A property with no pipelines shows on every pipeline's tickets.
  const forms = (await offered(tx, settings)).map(({ id, name }) => ({
    id,
    name,
    properties: properties
      .filter(({ pipelineIds }) => pipelineIds.length === 0 || pipelineIds.includes(id))
      .map(({ pipelineIds, ...property }) => property),
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

  res.json(await withOrg(visitor.orgId, (tx) => formsOf(tx, settings)));
});

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
  propertiesData: PropertiesPatch.default({}),
});

/**
 * The visitor files a ticket in a pipeline their messenger offers, as its customer. The team
 * reaches them by the email or phone they left, so a visitor leaves one first.
 */
const fileTicket = asVisitor(async (visitor, req, res) => {
  const { pipelineId, files, ...input } = File.parse(req.body);

  if (!visitor.identified)
    throw new ORPCError('FORBIDDEN', { message: 'Leave your email or phone number first' });

  const attachments = (await Promise.all(files.map((receipt) => fileOf(visitor, receipt)))).filter(
    (file) => file !== null,
  );

  if (attachments.length < files.length)
    throw new ORPCError('BAD_REQUEST', { message: 'Attach the file again' });

  const settings = await openMessenger(visitor);

  const filed = await withOrg(visitor.orgId, async (tx) => {
    const pipeline = (await offered(tx, settings)).find((offer) => offer.id === pipelineId);

    if (!pipeline) throw new ORPCError('BAD_REQUEST', { message: 'Pick a ticket form' });

    const id = await insertTicket(tx, { orgId: visitor.orgId, userId: null }, pipeline, {
      ...input,
      attachments,
      customerId: visitor.customerId,
    });

    const [ticket] = await ticketsOf(tx, visitor, pipeline.channelId, id);

    return ticket;
  });

  res.status(201).json(filed);
});

/** The messenger's ticket routes, under `/api/public/messenger/tickets`. */
export const ticketRoutes = { ticketForms, listTickets, fileTicket };
