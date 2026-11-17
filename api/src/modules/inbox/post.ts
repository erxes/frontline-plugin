import { enqueueJob } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { eq, getTableColumns, sql } from 'drizzle-orm';
import { JOBS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { conversations, integrations, messages } from '#/db/inbox.ts';
import type { Attachment } from '#/db/table.ts';
import { ADAPTERS } from './adapters.ts';
import { signalConversations } from './shared.ts';

/** The row without `org_id`, which the caller already knows, and what only adapters read. */
const { orgId: _orgId, providerData: _providerData, ...columns } = getTableColumns(messages);

export const messageColumns = columns;

/** What a member, or an automation acting as one, writes into a conversation. */
export type Written = {
  /** Set by a caller that may write the same message twice, so the repeat adds nothing. */
  id?: string;
  content: string;
  /** Rich text, sanitized (`html.ts`); null for plain text. */
  html?: string | null;
  attachments: Attachment[];
  internal: boolean;
  mentionedUserIds: string[];
  replyToId: string | null;
  /** The survey the customer votes on in this message. */
  surveyId?: string;
  /** What the adapter reads back when it sends it, such as a new mail's subject. */
  providerData?: Record<string, unknown>;
};

/**
 * Adds the message to `conversation` in `tx`. A reply waits on its adapter's `send` as a queued
 * job, or is sent once it commits when the adapter has none; the conversation leaves `new` and
 * stops waiting on a reply. A note only adds the author to the conversation's participants. A
 * message whose `id` exists already is returned as it is.
 */
export const postMessage = async (
  tx: Tx,
  author: { orgId: string; userId: string },
  conversation: { id: string; customerId: string; integrationId: string },
  written: Written,
) => {
  const [integration] = await tx
    .select({ kind: integrations.kind })
    .from(integrations)
    .where(eq(integrations.id, conversation.integrationId));

  const queued = !written.internal && Boolean(ADAPTERS.get(integration?.kind ?? '')?.send);

  const [message] = await tx
    .insert(messages)
    .values({
      ...written,
      orgId: author.orgId,
      conversationId: conversation.id,
      userId: author.userId,
      deliveryStatus: written.internal ? null : queued ? 'queued' : 'sent',
    })
    .onConflictDoNothing({ target: messages.id })
    .returning(messageColumns);

  if (!message) {
    const [existing] = await tx
      .select(messageColumns)
      .from(messages)
      .where(eq(messages.id, written.id ?? ''));

    if (!existing) throw new ORPCError('INTERNAL_SERVER_ERROR');

    return existing;
  }

  const participants = sql`array(select distinct unnest(array_append(${conversations.participantIds}, ${author.userId})))`;

  await tx
    .update(conversations)
    .set(
      written.internal
        ? { participantIds: participants }
        : {
            participantIds: participants,
            content: written.content,
            messageCount: sql`${conversations.messageCount} + 1`,
            lastMessageAt: message.createdAt,
            customerRespondedLast: false,
            readBy: sql`array(select distinct unnest(array_append(${conversations.readBy}, ${author.userId})))`,
            status: sql`case when ${conversations.status} = 'new' then 'open' else ${conversations.status} end`,
            firstRespondedAt: sql`coalesce(${conversations.firstRespondedAt}, now())`,
            firstRespondedBy: sql`coalesce(${conversations.firstRespondedBy}, ${author.userId})`,
          },
    )
    .where(eq(conversations.id, conversation.id));

  if (queued) await queueSend(tx, author.orgId, message.id, message.id);

  await signalConversations(tx, author.orgId, written.internal ? [] : [conversation]);

  return message;
};

/** Queues the reply for its adapter's `send`, once per `dedupeKey`. */
export const queueSend = (tx: Tx, orgId: string, messageId: string, dedupeKey: string) =>
  enqueueJob(tx, { orgId, name: JOBS.send.name, payload: { messageId }, dedupeKey });
