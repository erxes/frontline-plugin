import type { PluginJobDelivery } from '@erxes/core-contract';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { SEND_ATTEMPTS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { conversations, integrations, messages } from '#/db/inbox.ts';
import { logger } from '#/logger.ts';
import { AccountRefused } from '../integrations/provider.ts';
import { ADAPTERS } from './adapters.ts';
import { signalConversations } from './shared.ts';

const Payload = z.object({ messageId: z.string() });

const outgoingOf = (orgId: string, messageId: string) =>
  withOrg(orgId, async (tx) => {
    const [row] = await tx
      .select({
        message: {
          id: messages.id,
          content: messages.content,
          html: messages.html,
          attachments: messages.attachments,
          userId: messages.userId,
          providerData: messages.providerData,
          deliveryStatus: messages.deliveryStatus,
        },
        conversation: {
          id: conversations.id,
          externalId: conversations.externalId,
          customerId: conversations.customerId,
        },
        integration: { id: integrations.id, kind: integrations.kind, config: integrations.config },
      })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .innerJoin(integrations, eq(integrations.id, conversations.integrationId))
      .where(eq(messages.id, messageId));

    return row;
  });

/** Takes the queued reply for this attempt as `sending`; false when another attempt has it. */
const claim = (orgId: string, messageId: string) =>
  withOrg(orgId, async (tx) => {
    const claimed = await tx
      .update(messages)
      .set({ deliveryStatus: 'sending' })
      .where(and(eq(messages.id, messageId), eq(messages.deliveryStatus, 'queued')))
      .returning({ id: messages.id });

    return claimed.length > 0;
  });

/** Changes the reply's delivery, only while it is `from` when that is given, and says so. */
const settle = (
  orgId: string,
  messageId: string,
  conversation: { id: string; customerId: string },
  change: { deliveryStatus: 'queued' | 'sent' | 'failed'; externalId?: string | null },
  from?: 'sending',
) =>
  withOrg(orgId, async (tx) => {
    await tx
      .update(messages)
      .set(change)
      .where(and(eq(messages.id, messageId), from ? eq(messages.deliveryStatus, from) : undefined));
    await signalConversations(tx, orgId, [conversation]);
  });

/** Keeps the provider's ids of the parts of the reply sent so far, for an attempt after this. */
const recordParts = (orgId: string, messageId: string) => (sent: string[]) =>
  withOrg(orgId, async (tx) => {
    await tx
      .update(messages)
      .set({
        providerData: sql`coalesce(${messages.providerData}, '{}'::jsonb) || ${JSON.stringify({ parts: sent })}::jsonb`,
      })
      .where(eq(messages.id, messageId));
  });

/**
 * Sends one queued reply through its integration's adapter, outside any transaction, and marks it
 * sent with the provider's id. Each attempt first claims the reply, so two attempts at once never
 * both send it. A send the provider refused goes back to the queue and throws, so core tries
 * again, sending only the parts the provider didn't take; after the last attempt, or once the
 * provider refused the account's token, the reply is marked failed.
 *
 * An attempt that finds the reply claimed and unsettled can't know whether it reached the
 * customer: the earlier attempt died, or saved nothing after the provider took it. It marks the
 * reply failed, so a member sees Not delivered and decides, rather than the customer getting it
 * twice. An attempt still running when that happens marks it sent once the provider answers.
 */
export const sendReply = async (job: PluginJobDelivery) => {
  const { messageId } = Payload.parse(job.payload);
  const row = await outgoingOf(job.orgId, messageId);

  if (row?.message.deliveryStatus === 'sending')
    return settle(job.orgId, messageId, row.conversation, { deliveryStatus: 'failed' }, 'sending');

  if (row?.message.deliveryStatus !== 'queued' || !(await claim(job.orgId, messageId))) return;

  const send = ADAPTERS.get(row.integration.kind)?.send;

  if (!send) return settle(job.orgId, messageId, row.conversation, { deliveryStatus: 'sent' });

  let externalId: string | null;

  try {
    const deliver = await withOrg(job.orgId, (tx) => send(tx, row));

    ({ externalId } = await deliver(recordParts(job.orgId, messageId)));
  } catch (error) {
    logger.error({ err: error, messageId, attempt: job.attempt }, 'reply send failed');

    // The account is broken until a member repairs it, so another try would fail the same way.
    const refused = error instanceof AccountRefused;
    const last = refused || job.attempt >= SEND_ATTEMPTS;

    await settle(
      job.orgId,
      messageId,
      row.conversation,
      { deliveryStatus: last ? 'failed' : 'queued' },
      'sending',
    );

    if (refused) return;

    throw error;
  }

  await settle(job.orgId, messageId, row.conversation, { deliveryStatus: 'sent', externalId });
};
