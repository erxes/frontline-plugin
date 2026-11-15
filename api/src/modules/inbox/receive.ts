import { ORPCError } from '@orpc/server';
import { and, eq, sql } from 'drizzle-orm';
import { CONVERSATION_EVENTS, core } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { conversations, customerLinks, integrations, messages } from '#/db/inbox.ts';
import type { Attachment } from '#/db/table.ts';
import { publishConversationEvents, signalConversations } from './shared.ts';

/** The provider's user, as an adapter knows them. */
type Sender = { source: string; externalId: string; firstName: string };

const linkedCustomer = (orgId: string, { source, externalId }: Sender) =>
  withOrg(orgId, async (tx) => {
    const [link] = await tx
      .select({ customerId: customerLinks.customerId })
      .from(customerLinks)
      .where(and(eq(customerLinks.source, source), eq(customerLinks.externalId, externalId)));

    return link?.customerId;
  });

/**
 * The core customer behind a provider's user id: the linked one, else a new lead in core and its
 * link. Calls core outside any transaction. Two first messages at once make one link; the loser's
 * new customer stays in core unlinked.
 */
export const customerFor = async (orgId: string, sender: Sender) => {
  const linked = await linkedCustomer(orgId, sender);

  if (linked) return linked;

  const created = await core.forOrg(orgId).customers.create({
    firstName: sender.firstName,
    state: 'lead',
    source: sender.source,
  });

  await withOrg(orgId, (tx) =>
    tx
      .insert(customerLinks)
      .values({
        orgId,
        source: sender.source,
        externalId: sender.externalId,
        customerId: created.id,
      })
      .onConflictDoNothing(),
  );

  const customerId = await linkedCustomer(orgId, sender);

  if (!customerId) throw new ORPCError('INTERNAL_SERVER_ERROR');

  return customerId;
};

/** A customer's message an adapter received. */
export type Incoming = {
  integrationId: string;
  customerId: string;
  /** The conversation to add it to; without it, the provider's thread, else a new one. */
  conversationId?: string;
  externalConversationId?: string;
  externalId?: string;
  content: string;
  attachments?: Attachment[];
};

/** The conversation `incoming` belongs to, locked, or a new one with its `started` event. */
const conversationOf = async (tx: Tx, orgId: string, incoming: Incoming) => {
  const [integration] = await tx
    .select({ channelId: integrations.channelId, isActive: integrations.isActive })
    .from(integrations)
    .where(eq(integrations.id, incoming.integrationId));

  if (!integration?.isActive) throw new ORPCError('NOT_FOUND', { message: 'No such integration' });

  const match = incoming.conversationId
    ? eq(conversations.id, incoming.conversationId)
    : incoming.externalConversationId
      ? eq(conversations.externalId, incoming.externalConversationId)
      : undefined;

  if (match) {
    const [found] = await tx
      .select({ id: conversations.id, customerId: conversations.customerId })
      .from(conversations)
      .where(
        and(
          match,
          eq(conversations.integrationId, incoming.integrationId),
          eq(conversations.customerId, incoming.customerId),
        ),
      )
      .for('update');

    if (found) return found;

    if (incoming.conversationId)
      throw new ORPCError('NOT_FOUND', { message: 'No such conversation' });
  }

  const [created] = await tx
    .insert(conversations)
    .values({
      orgId,
      channelId: integration.channelId,
      integrationId: incoming.integrationId,
      customerId: incoming.customerId,
      externalId: incoming.externalConversationId,
    })
    .returning({ id: conversations.id, customerId: conversations.customerId });

  if (!created) throw new ORPCError('INTERNAL_SERVER_ERROR');

  await publishConversationEvents(tx, orgId, null, [
    {
      conversationId: created.id,
      customerId: created.customerId,
      type: CONVERSATION_EVENTS.started.type,
      summary: 'Started a conversation',
      payload: { integrationId: incoming.integrationId },
    },
  ]);

  return created;
};

/**
 * Adds a customer's message to its conversation, starting one when it has none, in one
 * transaction: the conversation waits on a reply again, unread by everyone, and a resolved one
 * reopens. A message the provider sent before (`externalId`) adds nothing. Returns the message.
 */
export const receive = (orgId: string, incoming: Incoming) =>
  withOrg(orgId, async (tx) => {
    const conversation = await conversationOf(tx, orgId, incoming);

    const [message] = await tx
      .insert(messages)
      .values({
        orgId,
        conversationId: conversation.id,
        customerId: incoming.customerId,
        content: incoming.content,
        attachments: incoming.attachments ?? [],
        externalId: incoming.externalId,
      })
      .onConflictDoNothing()
      .returning();

    if (!message) {
      const [existing] = await tx
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversation.id),
            eq(messages.externalId, incoming.externalId ?? ''),
          ),
        );

      if (!existing) throw new ORPCError('INTERNAL_SERVER_ERROR');

      return existing;
    }

    await tx
      .update(conversations)
      .set({
        content: incoming.content,
        messageCount: sql`${conversations.messageCount} + 1`,
        lastMessageAt: message.createdAt,
        customerRespondedLast: true,
        readBy: sql`'{}'`,
        status: sql`case when ${conversations.status} = 'resolved' then 'open' else ${conversations.status} end`,
        resolvedAt: null,
        resolvedBy: null,
      })
      .where(eq(conversations.id, conversation.id));

    await signalConversations(tx, orgId, [conversation]);

    return message;
  });
