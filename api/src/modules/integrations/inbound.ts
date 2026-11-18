import { and, eq, sql } from 'drizzle-orm';
import pLimit from 'p-limit';
import { MESSAGE_RECEIVED, refusedByCore } from '#/core.ts';
import { refusedData, type Tx, withOrg } from '#/db/client.ts';
import {
  conversations,
  customerLinks,
  integrations,
  messageReactions,
  messages,
} from '#/db/inbox.ts';
import { logger } from '#/logger.ts';
import { customerFor, receiveIn } from '../inbox/receive.ts';
import { signalConversations, signalMembers } from '../inbox/shared.ts';
import { FileRefused, storeFile } from '../files.ts';
import {
  type AccountRow,
  type InboundMessage,
  type InboundReaction,
  inOrder,
  type ProviderName,
} from './provider.ts';
import { providerOf } from './providers/index.ts';

/** The event a provider's new message publishes, for the providers that have one. */
const RECEIVED: Partial<Record<ProviderName, { type: string }>> = MESSAGE_RECEIVED;

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

/**
 * The core customer of each author of `inbound`, by their provider id, each asked for once. An
 * author core refuses, such as a name with a NUL byte, is logged and left out.
 */
const customersOf = async (row: AccountRow, inbound: InboundMessage[]) => {
  const authors = [...new Map(inbound.map(({ author }) => [author.externalId, author])).values()];
  const limit = pLimit(AUTHORS_AT_ONCE);
  const { whoIs } = providerOf(row.provider).open(row);

  const found = await Promise.all(
    authors.map((author) =>
      limit(async () => {
        const customerId = await customerFor(row.orgId, {
          source: row.provider,
          externalId: author.externalId,
          firstName: author.name || author.externalId,
          email: author.email,
          whoIs: author.name ? undefined : () => whoIs(author.externalId),
        }).catch((error: unknown) => {
          if (!refusedByCore(error)) throw error;

          logger.error(
            { err: error, accountId: row.id, author: author.externalId },
            'core refused the author, their messages skipped',
          );

          return null;
        });

        return [author.externalId, customerId] as const;
      }),
    ),
  );

  return new Map(
    found.flatMap(([id, customerId]) => (customerId ? [[id, customerId] as const] : [])),
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
 * A file the provider or core refuses is logged and named in the text, so the message still
 * reaches the inbox and the member knows something is missing. Any other failure throws, so the
 * provider or the job delivers the message again.
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
          if (!(error instanceof FileRefused)) throw error;

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
 * rest again; a message delivered twice adds nothing. A message Postgres refuses, or whose author
 * core refuses, would fail every time, so it is logged and skipped. An account no channel uses keeps nothing.
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
      const customerId = customers.get(message.author.externalId);

      // Core refused its author, and would every time.
      if (!customerId) {
        await withOrg(row.orgId, async (tx) => saved?.(tx, message));

        return;
      }

      // Core's storage is asked before the transaction opens.
      const { content, attachments } = await withFiles(row, integrationId, message);

      await withOrg(row.orgId, async (tx) => {
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
