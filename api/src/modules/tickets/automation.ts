import { createHash } from 'node:crypto';
import type { CoreCall, PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { channels } from '#/db/schema.ts';
import { pipelines, Priority, tickets } from '#/db/tickets.ts';
import { fileTicket } from './tickets.ts';

const Call = z.object({
  input: z.object({
    pipelineId: z.string().min(1),
    name: z.string().trim().min(1).max(500),
    description: z.string().trim().max(10_000).optional(),
    priority: z.coerce.number().pipe(Priority).optional(),
  }),
  context: z.object({
    event: z
      .object({
        subjectType: z.string().nullish(),
        subjectId: z.string().nullish(),
        payload: z
          .object({ conversationId: z.string(), customerId: z.string() })
          .partial()
          .nullish(),
      })
      .nullish(),
    subject: z.object({ id: z.string() }).nullish(),
  }),
});

export const createTicket = async (call: CoreCall, body: unknown, key: string) => {
  const { input, context } = Call.parse(body);
  const event = context.event;
  const id = createHash('sha256').update(`${call.orgId}:${key}`).digest('base64url');

  const customerId =
    context.subject?.id ??
    (event?.subjectType === 'customer' ? event.subjectId : null) ??
    event?.payload?.customerId ??
    null;

  return withOrg(call.orgId, async (tx) => {
    const [existing] = await tx
      .select({ id: tickets.id, number: tickets.number })
      .from(tickets)
      .where(eq(tickets.id, id));

    if (existing) return { ticketId: existing.id, number: existing.number };

    const [pipeline] = await tx
      .select({ id: pipelines.id, channelId: pipelines.channelId })
      .from(pipelines)
      .where(eq(pipelines.id, input.pipelineId));

    if (!pipeline) throw new ORPCError('NOT_FOUND', { message: 'No such pipeline' });

    const ticketId = await fileTicket(tx, { orgId: call.orgId, userId: call.userId }, pipeline, {
      id,
      name: input.name,
      description: input.description,
      priority: input.priority,
      customerId,
      conversationId: event?.payload?.conversationId ?? null,
    });

    const [filed] = await tx
      .select({ number: tickets.number })
      .from(tickets)
      .where(eq(tickets.id, ticketId));

    return { ticketId, number: filed?.number ?? null };
  });
};

export const pipelineChoices = async (member: PluginMember) => {
  if (!member.can(PERMISSIONS.channelView))
    throw new ORPCError('FORBIDDEN', {
      message: `You need the ${PERMISSIONS.channelView} permission`,
    });

  const rows = await withOrg(member.orgId, (tx) =>
    tx
      .select({ value: pipelines.id, pipeline: pipelines.name, channel: channels.name })
      .from(pipelines)
      .innerJoin(channels, eq(channels.id, pipelines.channelId))
      .orderBy(asc(channels.name), asc(pipelines.name)),
  );

  return rows.map(({ value, pipeline, channel }) => ({ value, label: `${channel} · ${pipeline}` }));
};
