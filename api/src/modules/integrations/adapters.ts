import { ORPCError } from '@orpc/server';
import { and, desc, eq, isNotNull, or } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '#/db/client.ts';
import { customerLinks, messages } from '#/db/inbox.ts';
import type { Adapter, Outgoing } from '../inbox/adapters.ts';
import { recordCheck } from './accounts.ts';
import { AccountRefused, type AccountRow, type ProviderName } from './provider.ts';
import { providerOf } from './providers/index.ts';
import { accountRow } from './store.ts';

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
    row,
    account: providerOf(row.provider).open(row),
    threadId: conversation.externalId,
    context: await replyContext(tx, provider, conversation.id, conversation.customerId),
  };
};

/** `call` through `row`; a token the provider refused marks the account broken at once. */
const through = <T>(row: AccountRow, call: () => Promise<T>) =>
  call().catch(async (error: unknown) => {
    if (error instanceof AccountRefused) await recordCheck(row, error.message);

    throw error;
  });

const adapterOf = (provider: ProviderName, label: string): Adapter => ({
  kind: provider,
  label,
  config: AccountConfig,
  send: async (tx, outgoing) => {
    const { row, account, threadId, context } = await threadOf(tx, provider, outgoing);
    const { message } = outgoing;

    return async () => ({
      externalId: await through(row, () =>
        account.send({
          threadId,
          text: message.content,
          html: message.html,
          attachments: message.attachments,
          providerData: message.providerData,
          ...context,
        }),
      ),
    });
  },
  react: async (tx, { emoji, emojis, ...outgoing }) => {
    const { row, account, threadId, context } = await threadOf(tx, provider, outgoing);
    const { externalId, providerData } = outgoing.message;
    const { react } = account;

    if (!react || !externalId)
      throw new ORPCError('BAD_REQUEST', {
        message: `${label} takes no reactions on this message`,
      });

    return () =>
      through(row, () =>
        react({ threadId, to: context.to, message: { externalId, providerData }, emoji, emojis }),
      );
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
