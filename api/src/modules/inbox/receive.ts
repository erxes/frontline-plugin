import { ORPCError } from '@orpc/server';
import { and, eq, sql } from 'drizzle-orm';
import { PLUGIN } from '#/config.ts';
import { CONVERSATION_EVENTS, core, MESSAGE_RECEIVED_EVENT } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { conversations, customerLinks, integrations, messages } from '#/db/inbox.ts';
import type { Attachment } from '#/db/table.ts';
import { logger } from '#/logger.ts';
import type { Person } from '../integrations/provider.ts';
import { publishConversationEvents, signalConversations } from './shared.ts';

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

const linkedCustomer = (orgId: string, { source, externalId }: Sender) =>
  withOrg(orgId, async (tx) => {
    const [link] = await tx
      .select({ customerId: customerLinks.customerId })
      .from(customerLinks)
      .where(and(eq(customerLinks.source, source), eq(customerLinks.externalId, externalId)));

    return link?.customerId;
  });

/**
 * The core customer behind a provider's user id: the linked one, else core's customer with that
 * email, else a new lead in core, and its link. Calls core outside any transaction. Two first
 * messages at once make one link; the loser's new customer stays in core unlinked.
 */
export const customerFor = async (orgId: string, sender: Sender) => {
  const linked = await linkedCustomer(orgId, sender);

  if (linked) return linked;

  const lead = { ...(await nameOf(sender)), state: 'lead' as const, source: sender.source };
  const customers = core.forOrg(orgId).customers;

  const created = sender.email
    ? (await customers.findOrCreate({ ...lead, primaryEmail: sender.email })).customer
    : await customers.create(lead);

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
    p_link => ${`/${PLUGIN}/inbox?conversationId=${encodeURIComponent(payload.conversationId)}`},
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
  attachments?: Attachment[];
  /** What only the adapter reads back, such as a mail's subject. */
  providerData?: Record<string, unknown>;
  /** The event type a new message publishes for automations to start from. */
  event?: string;
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

    if (found) return { ...found, kind: integration.kind };

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

  return { ...created, kind: integration.kind };
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
      status: sql`case when ${conversations.status} = 'resolved' then 'open' else ${conversations.status} end`,
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

  return { message, changed: conversation };
};

/** `receiveIn` in a transaction of its own, which signals the conversation. Returns the message. */
export const receive = (orgId: string, incoming: Incoming) =>
  withOrg(orgId, async (tx) => {
    const { message, changed } = await receiveIn(tx, orgId, incoming);

    if (changed) await signalConversations(tx, orgId, [changed]);

    return message;
  });
