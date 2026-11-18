import type { PluginJobDelivery } from '@erxes/core-contract';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { SEND_ATTEMPTS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { conversations, integrations, messages } from '#/db/inbox.ts';
import { logger } from '#/logger.ts';
import { PartlySent } from '../integrations/provider.ts';
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

const settle = (
  orgId: string,
  messageId: string,
  conversation: { id: string; customerId: string },
  change: { deliveryStatus: 'sent' | 'failed'; externalId?: string | null },
) =>
  withOrg(orgId, async (tx) => {
    await tx.update(messages).set(change).where(eq(messages.id, messageId));
    await signalConversations(tx, orgId, [conversation]);
  });

/**
 * Sends one queued reply through its integration's adapter, outside any transaction, and marks it
 * sent with the provider's id. A failed send throws, so core tries again; after the last attempt,
 * or once the provider took part of it, the reply is marked failed. A reply that is no longer
 * queued is left alone, so a repeat is safe.
 */
export const sendReply = async (job: PluginJobDelivery) => {
  const { messageId } = Payload.parse(job.payload);
  const row = await outgoingOf(job.orgId, messageId);

  if (row?.message.deliveryStatus !== 'queued') return;

  const send = ADAPTERS.get(row.integration.kind)?.send;

  if (!send) return settle(job.orgId, messageId, row.conversation, { deliveryStatus: 'sent' });

  try {
    const deliver = await withOrg(job.orgId, (tx) => send(tx, row));
    const { externalId } = await deliver();

    await settle(job.orgId, messageId, row.conversation, { deliveryStatus: 'sent', externalId });
  } catch (error) {
    logger.error({ err: error, messageId, attempt: job.attempt }, 'reply send failed');

    // Part of it reached the customer, so another try would send that part again.
    const partly = error instanceof PartlySent;

    if (partly || job.attempt >= SEND_ATTEMPTS)
      await settle(job.orgId, messageId, row.conversation, { deliveryStatus: 'failed' });

    if (!partly) throw error;
  }
};
