import { ORPCError } from '@orpc/server';
import { and, desc, eq, isNotNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { MESSAGE_RECEIVED } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import {
  conversations,
  customerLinks,
  integrations,
  messageReactions,
  messages,
} from '#/db/inbox.ts';
import { logger } from '#/logger.ts';
import type { Adapter } from '../inbox/adapters.ts';
import { customerFor, receive } from '../inbox/receive.ts';
import { signalConversations } from '../inbox/shared.ts';
import {
  type AccountRow,
  type InboundMessage,
  type InboundReaction,
  inOrder,
  type ProviderName,
} from './provider.ts';
import { providerOf } from './providers/index.ts';
import { accountRow } from './store.ts';

/** The event a provider's new message publishes, for the providers that have one. */
const RECEIVED: Partial<Record<ProviderName, { type: string }>> = MESSAGE_RECEIVED;

/** An integration of a provider's kind names the connected account its conversations go through. */
const AccountConfig = z.object({ accountId: z.string().min(1) });

/**
 * What a reply answers: the customer's id at the provider and the last message it follows, the
 * customer's or one a member began the thread with, such as a new mail.
 */
const replyContext = async (
  tx: Tx,
  provider: ProviderName,
  conversationId: string,
  customerId: string,
) => {
  const [link] = await tx
    .select({ externalId: customerLinks.externalId })
    .from(customerLinks)
    .where(and(eq(customerLinks.source, provider), eq(customerLinks.customerId, customerId)));

  const [last] = await tx
    .select({
      externalId: messages.externalId,
      providerData: messages.providerData,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        or(isNotNull(messages.customerId), isNotNull(messages.providerData)),
        isNotNull(messages.externalId),
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(1);

  if (!link)
    throw new ORPCError('NOT_FOUND', { message: 'The customer has no id at the provider' });

  return {
    to: link.externalId,
    replyTo: last?.externalId
      ? { externalId: last.externalId, providerData: last.providerData, createdAt: last.createdAt }
      : null,
  };
};

/** The integration's account, opened, with the thread and what a reply answers at the provider. */
const threadOf = async (
  provider: ProviderName,
  {
    orgId,
    integration,
    conversation,
  }: Pick<Parameters<NonNullable<Adapter['send']>>[0], 'orgId' | 'integration' | 'conversation'>,
) => {
  const { accountId } = AccountConfig.parse(integration.config);

  if (!conversation.externalId)
    throw new ORPCError('BAD_REQUEST', {
      message: 'The conversation has no thread at the provider',
    });

  const threadId = conversation.externalId;

  const { row, context } = await withOrg(orgId, async (tx) => ({
    row: await accountRow(tx, accountId),
    context: await replyContext(tx, provider, conversation.id, conversation.customerId),
  }));

  return { account: providerOf(row.provider).open(row), threadId, context };
};

const adapterOf = (provider: ProviderName, label: string): Adapter => ({
  kind: provider,
  label,
  config: AccountConfig,
  send: async (outgoing) => {
    const { account, threadId, context } = await threadOf(provider, outgoing);
    const { message } = outgoing;

    const externalId = await account.send({
      threadId,
      text: message.content,
      html: message.html,
      attachments: message.attachments,
      providerData: message.providerData,
      ...context,
    });

    return { externalId };
  },
  react: async ({ emoji, emojis, ...outgoing }) => {
    const { account, threadId, context } = await threadOf(provider, outgoing);
    const { externalId, providerData } = outgoing.message;

    if (!account.react || !externalId)
      throw new ORPCError('BAD_REQUEST', {
        message: `${label} takes no reactions on this message`,
      });

    await account.react({
      threadId,
      to: context.to,
      message: { externalId, providerData },
      emoji,
      emojis,
    });
  },
});

/** The inbox's adapters for the providers' integrations, by kind. */
export const PROVIDER_ADAPTERS = [
  adapterOf('facebook', 'Facebook Messenger'),
  adapterOf('instagram', 'Instagram'),
  adapterOf('telegram', 'Telegram'),
  adapterOf('discord', 'Discord'),
  adapterOf('mail', 'Email'),
];

/** The active integration whose conversations go through `row`, if a channel has one. */
const integrationOf = async (row: AccountRow) => {
  const [found] = await withOrg(row.orgId, (tx) =>
    tx
      .select({ id: integrations.id })
      .from(integrations)
      .where(
        and(
          eq(integrations.kind, row.provider),
          sql`${integrations.config} ->> 'accountId' = ${row.id}`,
          eq(integrations.isActive, true),
        ),
      )
      .orderBy(integrations.createdAt, integrations.id)
      .limit(1),
  );

  return found?.id;
};

/**
 * Hands what reached an account to the inbox: each sender is found or made a core customer, and
 * each message joins its thread's conversation. A failure throws, so the provider or the job
 * delivers again; a message delivered twice adds nothing. An account no channel uses keeps
 * nothing.
 */
export const deliverInbound = async (row: AccountRow, inbound: InboundMessage[]) => {
  if (!inbound.length) return;

  const integrationId = await integrationOf(row);

  if (!integrationId) {
    logger.info(
      { accountId: row.id, provider: row.provider },
      'messages for an account no channel uses',
    );

    return;
  }

  // A thread has one author. Authors go at once and each one's messages in order, so the first
  // makes the customer and opens the conversation the rest join.
  await Promise.all(
    Object.values(Object.groupBy(inbound, (message) => message.author.externalId)).map(
      (written = []) =>
        inOrder(written, async (message) =>
          receive(row.orgId, {
            integrationId,
            customerId: await customerFor(row.orgId, {
              source: row.provider,
              externalId: message.author.externalId,
              firstName: message.author.name || message.author.externalId,
              email: message.author.email,
            }),
            externalConversationId: message.threadId,
            externalId: message.messageId,
            content: message.text,
            attachments: message.attachments,
            providerData: message.providerData,
            event: message.event ?? RECEIVED[row.provider]?.type,
          }),
        ),
    ),
  );
};

/**
 * Keeps each customer's reactions as the provider reports them: their set replaces what they had
 * on the message. One on a message or from a customer frontline doesn't have is skipped.
 */
export const deliverReactions = async (row: AccountRow, reactions: InboundReaction[]) => {
  if (!reactions.length) return;

  const integrationId = await integrationOf(row);

  if (!integrationId) return;

  await withOrg(row.orgId, async (tx) => {
    // One transaction: the changes go one after another on its connection.
    await inOrder(reactions, async (reaction) => {
      const [found] = await tx
        .select({ messageId: messages.id, customerId: customerLinks.customerId })
        .from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .innerJoin(
          customerLinks,
          and(
            eq(customerLinks.source, row.provider),
            eq(customerLinks.externalId, reaction.author.externalId),
          ),
        )
        .where(
          and(
            eq(conversations.integrationId, integrationId),
            eq(conversations.externalId, reaction.threadId),
            eq(messages.externalId, reaction.messageId),
          ),
        );

      if (!found) return;

      await tx
        .delete(messageReactions)
        .where(
          and(
            eq(messageReactions.messageId, found.messageId),
            eq(messageReactions.customerId, found.customerId),
          ),
        );

      if (reaction.emojis.length)
        await tx.insert(messageReactions).values(
          [...new Set(reaction.emojis)].map((emoji) => ({
            orgId: row.orgId,
            messageId: found.messageId,
            customerId: found.customerId,
            emoji,
          })),
        );
    });

    await signalConversations(tx, row.orgId, []);
  });
};
