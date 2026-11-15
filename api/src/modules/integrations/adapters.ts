import { ORPCError } from '@orpc/server';
import { and, desc, eq, isNotNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { MESSAGE_RECEIVED } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { customerLinks, integrations, messages } from '#/db/inbox.ts';
import { logger } from '#/logger.ts';
import type { Adapter } from '../inbox/adapters.ts';
import { customerFor, receive } from '../inbox/receive.ts';
import { type AccountRow, type InboundMessage, inOrder, type ProviderName } from './provider.ts';
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
    .select({ externalId: messages.externalId, providerData: messages.providerData })
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
      ? { externalId: last.externalId, providerData: last.providerData }
      : null,
  };
};

const adapterOf = (provider: ProviderName, label: string): Adapter => ({
  kind: provider,
  label,
  config: AccountConfig,
  send: async ({ orgId, integration, conversation, message }) => {
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

    const externalId = await providerOf(row.provider)
      .open(row)
      .send({
        threadId,
        text: message.content,
        attachments: message.attachments,
        providerData: message.providerData,
        ...context,
      });

    return { externalId };
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
            event: RECEIVED[row.provider]?.type,
          }),
        ),
    ),
  );
};
