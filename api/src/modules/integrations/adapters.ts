import { ORPCError } from '@orpc/server';
import { and, desc, eq, isNotNull, or, sql } from 'drizzle-orm';
import pLimit from 'p-limit';
import { z } from 'zod';
import { MESSAGE_RECEIVED } from '#/core.ts';
import { refusedData, type Tx, withOrg } from '#/db/client.ts';
import {
  conversations,
  customerLinks,
  integrations,
  messageReactions,
  messages,
} from '#/db/inbox.ts';
import { logger } from '#/logger.ts';
import type { Adapter, Outgoing } from '../inbox/adapters.ts';
import { customerFor, receiveIn } from '../inbox/receive.ts';
import { signalConversations, signalMembers } from '../inbox/shared.ts';
import {
  type AccountRow,
  type InboundMessage,
  type InboundReaction,
  inOrder,
  type ProviderName,
} from './provider.ts';
import { providerOf } from './providers/index.ts';
import { storeFile } from '../files.ts';
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
  tx: Tx,
  provider: ProviderName,
  { integration, conversation }: Pick<Outgoing, 'integration' | 'conversation'>,
) => {
  const { accountId } = AccountConfig.parse(integration.config);

  if (!conversation.externalId)
    throw new ORPCError('BAD_REQUEST', {
      message: 'The conversation has no thread at the provider',
    });

  const row = await accountRow(tx, accountId);

  return {
    account: providerOf(row.provider).open(row),
    threadId: conversation.externalId,
    context: await replyContext(tx, provider, conversation.id, conversation.customerId),
  };
};

const adapterOf = (provider: ProviderName, label: string): Adapter => ({
  kind: provider,
  label,
  config: AccountConfig,
  send: async (tx, outgoing) => {
    const { account, threadId, context } = await threadOf(tx, provider, outgoing);
    const { message } = outgoing;

    return async () => ({
      externalId: await account.send({
        threadId,
        text: message.content,
        html: message.html,
        attachments: message.attachments,
        providerData: message.providerData,
        ...context,
      }),
    });
  },
  react: async (tx, { emoji, emojis, ...outgoing }) => {
    const { account, threadId, context } = await threadOf(tx, provider, outgoing);
    const { externalId, providerData } = outgoing.message;
    const { react } = account;

    if (!react || !externalId)
      throw new ORPCError('BAD_REQUEST', {
        message: `${label} takes no reactions on this message`,
      });

    return () =>
      react({ threadId, to: context.to, message: { externalId, providerData }, emoji, emojis });
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

/** How many of a delivery's authors are found or made in core at once. */
const AUTHORS_AT_ONCE = 4;

/** The core customer of each author of `inbound`, by their provider id, each asked for once. */
const customersOf = async (row: AccountRow, inbound: InboundMessage[]) => {
  const authors = [...new Map(inbound.map(({ author }) => [author.externalId, author])).values()];
  const limit = pLimit(AUTHORS_AT_ONCE);
  const { whoIs } = providerOf(row.provider).open(row);

  return new Map(
    await Promise.all(
      authors.map((author) =>
        limit(async () => {
          const customerId = await customerFor(row.orgId, {
            source: row.provider,
            externalId: author.externalId,
            firstName: author.name || author.externalId,
            email: author.email,
            whoIs: author.name ? undefined : () => whoIs(author.externalId),
          });

          return [author.externalId, customerId] as const;
        }),
      ),
    ),
  );
};

/** Whether the inbox already has `message`, so a repeated delivery doesn't fetch its files again. */
const alreadyKept = (orgId: string, integrationId: string, message: InboundMessage) =>
  withOrg(orgId, async (tx) => {
    const [kept] = await tx
      .select({ id: messages.id })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(
        and(
          eq(conversations.integrationId, integrationId),
          eq(conversations.externalId, message.threadId),
          eq(messages.externalId, message.messageId),
        ),
      )
      .limit(1);

    return kept !== undefined;
  });

/**
 * The text and attachments of `message` with the files the provider holds kept in core's storage.
 * A file core won't keep is logged and named in the text, so the message still reaches the inbox
 * and the member knows something is missing.
 */
const withFiles = async (row: AccountRow, integrationId: string, message: InboundMessage) => {
  const files = message.files ?? [];

  if (files.length === 0 || (await alreadyKept(row.orgId, integrationId, message)))
    return { content: message.text, attachments: message.attachments };

  const kept = await Promise.all(
    files.map(async (file) =>
      file
        .bytes()
        .then((bytes) =>
          storeFile(row.orgId, { name: file.name, contentType: file.contentType, bytes }),
        )
        .catch((error: unknown) => {
          logger.warn(
            { err: error, accountId: row.id, messageId: message.messageId, file: file.name },
            'inbound file not kept',
          );

          return file.name;
        }),
    ),
  );

  const lost = kept.filter((file) => typeof file === 'string');

  return {
    content: [message.text, ...lost.map((name) => `[${name} could not be saved]`)]
      .filter(Boolean)
      .join('\n\n'),
    attachments: [...message.attachments, ...kept.filter((file) => typeof file !== 'string')],
  };
};

/**
 * Hands what reached an account to the inbox: each author is found or made a core customer once,
 * and each message joins its thread's conversation in order, in a transaction of its own that
 * also runs `saved`, so a caller can note how far it got. The inbox hears once, at the end. A
 * failure throws after the messages before it are kept, so the provider or the job delivers the
 * rest again; a message delivered twice adds nothing. A message Postgres refuses, which would
 * fail every time, is logged and skipped. An account no channel uses keeps nothing.
 */
export const deliverInbound = async <T extends InboundMessage>(
  row: AccountRow,
  inbound: T[],
  saved?: (tx: Tx, message: T) => Promise<unknown>,
) => {
  if (!inbound.length) return;

  const integrationId = await integrationOf(row);

  if (!integrationId) {
    logger.info(
      { accountId: row.id, provider: row.provider },
      'messages for an account no channel uses',
    );

    return;
  }

  const customers = await customersOf(row, inbound);
  const changed: { id: string; customerId: string }[] = [];

  try {
    await inOrder(inbound, async (message) => {
      // Core's storage is asked before the transaction opens.
      const { content, attachments } = await withFiles(row, integrationId, message);

      await withOrg(row.orgId, async (tx) => {
        const customerId = customers.get(message.author.externalId);

        if (!customerId) throw new ORPCError('INTERNAL_SERVER_ERROR');

        const received = await receiveIn(tx, row.orgId, {
          integrationId,
          customerId,
          externalConversationId: message.threadId,
          externalId: message.messageId,
          content,
          attachments,
          providerData: message.providerData,
          event: message.event ?? RECEIVED[row.provider]?.type,
        });

        await saved?.(tx, message);

        if (received.changed) changed.push(received.changed);
      }).catch(async (error: unknown) => {
        if (!refusedData(error)) throw error;

        // It would fail the same way every time, so it would hold back every message after it.
        logger.error(
          { err: error, accountId: row.id, messageId: message.messageId },
          'inbound message the inbox cannot store, skipped',
        );
        await withOrg(row.orgId, async (tx) => saved?.(tx, message));
      });
    });
  } finally {
    if (changed.length > 0)
      await withOrg(row.orgId, (tx) => signalConversations(tx, row.orgId, changed));
  }
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
    const changed = await inOrder(reactions, async (reaction) => {
      const [found] = await tx
        .select({
          messageId: messages.id,
          conversationId: messages.conversationId,
          customerId: customerLinks.customerId,
        })
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

      if (!found) return [];

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

      return [found.conversationId];
    });

    await signalMembers(tx, row.orgId, changed.flat());
  });
};
