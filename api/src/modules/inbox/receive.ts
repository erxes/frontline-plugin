import { ORPCError } from '@orpc/server';
import { and, eq, sql } from 'drizzle-orm';
import { PLUGIN } from '#/config.ts';
import { CONVERSATION_EVENTS, core, MESSAGE_RECEIVED_EVENT } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { conversations, customerLinks, integrations, messages } from '#/db/inbox.ts';
import type { StoredFile } from '#/db/table.ts';
import { logger } from '#/logger.ts';
import type { Person } from '../integrations/provider.ts';
import {
  conversationLink,
  publishConversationEvents,
  signalArrival,
  signalConversations,
  statusFrom,
} from './shared.ts';

/**
 * The provider's user, as an adapter knows them; `email` when the provider gives one. `whoIs`
 * asks the provider for their name, once, when they become a customer.
 */
type Sender = {
  source: string;
  externalId: string;
  firstName: string;
  email?: string;
  whoIs?: () => Promise<Person | null>;
};

/** The sender's name at the provider; a refusal keeps the name the message gave and is logged. */
const nameOf = async (sender: Sender) => {
  const found = await sender.whoIs?.().catch((error: unknown) => {
    logger.warn(
      { err: error, source: sender.source, externalId: sender.externalId },
      'provider did not name a new customer',
    );

    return null;
  });

  return found ?? { firstName: sender.firstName };
};

/** The customer the sender is linked to, if any. */
const linkOf = async (tx: Tx, { source, externalId }: Sender) => {
  const [link] = await tx
    .select({ customerId: customerLinks.customerId })
    .from(customerLinks)
    .where(and(eq(customerLinks.source, source), eq(customerLinks.externalId, externalId)));

  return link?.customerId;
};

/**
 * The core customer behind a provider's user id: the linked one, else core's customer with that
 * email, else a new lead in core, and its link. Calls core outside any transaction. Two first
 * messages at once both ask core and the first link stays; the other removes the lead it made, so
 * no customer is left in core without a link.
 */
export const customerFor = async (orgId: string, sender: Sender) => {
  const linked = await withOrg(orgId, (tx) => linkOf(tx, sender));

  if (linked) return linked;

  const lead = { ...(await nameOf(sender)), state: 'lead' as const, source: sender.source };
  const customers = core.forOrg(orgId).customers;

  const { customer, created } = sender.email
    ? await customers.findOrCreate({ ...lead, primaryEmail: sender.email })
    : { customer: await customers.create(lead), created: true };

  // Returns the link that stays: this one, or the one another first message made meanwhile.
  const [link] = await withOrg(orgId, (tx) =>
    tx
      .insert(customerLinks)
      .values({
        orgId,
        source: sender.source,
        externalId: sender.externalId,
        customerId: customer.id,
      })
      .onConflictDoUpdate({
        target: [customerLinks.orgId, customerLinks.source, customerLinks.externalId],
        set: { customerId: sql`${customerLinks.customerId}` },
      })
      .returning({ customerId: customerLinks.customerId }),
  );

  if (!link) throw new ORPCError('INTERNAL_SERVER_ERROR');

  if (created && link.customerId !== customer.id)
    await customers.remove({ ids: [customer.id] }).catch((error: unknown) => {
      logger.error({ err: error, orgId, customerId: customer.id }, 'unlinked lead stays in core');
    });

  return link.customerId;
};

/**
 * Publishes a customer's message for automations, keyed by the message so a replay adds nothing.
 * The payload names the conversation and whether the bot may still answer it (`operator`).
 */
const publishMessageReceived = async (
  tx: Tx,
  orgId: string,
  payload: { conversationId: string; messageId: string; content: string } & Record<string, string>,
) => {
  await tx.execute(sql`select core_publish_event(
    p_org_id => ${orgId},
    p_source => ${PLUGIN},
    p_type => ${MESSAGE_RECEIVED_EVENT.type},
    p_payload => ${JSON.stringify(payload)}::jsonb,
    p_summary => 'Sent a message',
    p_link => ${conversationLink(payload.conversationId)},
    p_dedupe_key => ${`message:${payload.messageId}`}
  )`);
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
  attachments?: StoredFile[];
  /** What only the adapter reads back, such as a mail's subject. */
  providerData?: Record<string, unknown>;
  /** The provider's id for the message this one answers, if the conversation has it. */
  quotedExternalId?: string;
  /** The event type a new message publishes for automations to start from. */
  event?: string;
  /** A member started it, as with an outgoing call, so no one hears it arrive. */
  outgoing?: boolean;
};

/** The conversation `incoming` belongs to, locked, or a new one with its `started` event. */
const conversationOf = async (tx: Tx, orgId: string, incoming: Incoming) => {
  const [integration] = await tx
    .select({
      channelId: integrations.channelId,
      isActive: integrations.isActive,
      kind: integrations.kind,
    })
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
      .select({
        id: conversations.id,
        customerId: conversations.customerId,
        operator: conversations.operator,
      })
      .from(conversations)
      .where(
        and(
          match,
          eq(conversations.integrationId, incoming.integrationId),
          eq(conversations.customerId, incoming.customerId),
        ),
      )
      .for('update');

    if (found) return { ...found, kind: integration.kind, channelId: integration.channelId };

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
    .returning({
      id: conversations.id,
      customerId: conversations.customerId,
      operator: conversations.operator,
    });

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

  return { ...created, kind: integration.kind, channelId: integration.channelId };
};

/** The id of the conversation's message with the provider's id `externalId`, if it has one. */
const messageWith = async (tx: Tx, conversationId: string, externalId: string | undefined) => {
  if (!externalId) return undefined;

  const [found] = await tx
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.externalId, externalId)));

  return found?.id;
};

/**
 * Adds a customer's message to its conversation in `tx`, starting one when it has none: the
 * conversation waits on a reply again, unread by everyone, and a resolved one reopens. A new
 * message publishes `event` for automations. A message the provider sent before (`externalId`)
 * adds nothing. Returns the message, and its conversation when it changed, for the caller to
 * signal.
 */
export const receiveIn = async (tx: Tx, orgId: string, incoming: Incoming) => {
  const conversation = await conversationOf(tx, orgId, incoming);

  const replyToId = await messageWith(tx, conversation.id, incoming.quotedExternalId);

  const [message] = await tx
    .insert(messages)
    .values({
      orgId,
      conversationId: conversation.id,
      customerId: incoming.customerId,
      content: incoming.content,
      attachments: incoming.attachments ?? [],
      externalId: incoming.externalId,
      providerData: incoming.providerData,
      replyToId,
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

    return { message: existing, changed: null };
  }

  await tx
    .update(conversations)
    .set({
      content: incoming.content,
      messageCount: sql`${conversations.messageCount} + 1`,
      lastMessageAt: message.createdAt,
      customerRespondedLast: true,
      readBy: sql`'{}'`,
      status: statusFrom('resolved', 'open'),
      resolvedAt: null,
      resolvedBy: null,
    })
    .where(eq(conversations.id, conversation.id));

  if (incoming.event)
    await publishConversationEvents(tx, orgId, null, [
      {
        conversationId: conversation.id,
        customerId: conversation.customerId,
        type: incoming.event,
        summary: null,
        payload: {
          ...incoming.providerData,
          conversationId: conversation.id,
          messageId: message.id,
          integrationId: incoming.integrationId,
          content: message.content,
        },
      },
    ]);

  await publishMessageReceived(tx, orgId, {
    conversationId: conversation.id,
    customerId: conversation.customerId,
    integrationId: incoming.integrationId,
    kind: conversation.kind,
    operator: conversation.operator,
    messageId: message.id,
    content: message.content,
  });

  if (!incoming.outgoing) await signalArrival(tx, orgId, conversation);

  return { message, changed: conversation };
};

/** `receiveIn` in a transaction of its own, which signals the conversation. Returns the message. */
export const receive = (orgId: string, incoming: Incoming) =>
  withOrg(orgId, async (tx) => {
    const { message, changed } = await receiveIn(tx, orgId, incoming);

    if (changed) await signalConversations(tx, orgId, [changed]);

    return message;
  });
