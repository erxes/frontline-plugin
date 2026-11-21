import { enqueueJob } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { eq, getTableColumns, sql } from 'drizzle-orm';
import { JOBS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { conversations, type DELIVERY_STATUSES, integrations, messages } from '#/db/inbox.ts';
import { ADAPTERS } from './adapters.ts';
import { signalConversations, signalMembers, statusFrom } from './shared.ts';

/** The row without `org_id`, which the caller already knows, and what only adapters read. */
const { orgId: _orgId, providerData: _providerData, ...columns } = getTableColumns(messages);

/**
 * How long a reply may wait on its send job, longer than the job's attempts and their waits
 * (`JOBS.send.retry`). A reply nothing sent or failed by then, such as one whose job never ran,
 * is failed, so a member can send it again.
 */
export const SEND_DEADLINE = sql`interval '15 minutes'`;

/** Whether the reply waited on its send job past `SEND_DEADLINE`. */
export const overdue = sql`(${messages.deliveryStatus} in ('queued', 'sending') and ${messages.queuedAt} < now() - ${SEND_DEADLINE})`;

export const messageColumns = {
  ...columns,
  deliveryStatus: sql<
    (typeof DELIVERY_STATUSES)[number] | null
  >`case when ${overdue} then 'failed' else ${messages.deliveryStatus} end`,
};

type Message = typeof messages.$inferSelect;

/**
 * Adds `written`, a message from a member or an automation acting as one, to `conversation` in
 * `tx`. A reply waits on its adapter's `send` as a queued job, or is sent once it commits when
 * the adapter has none; the conversation leaves `new` and stops waiting on a reply. A note only
 * adds the author to the conversation's participants. A caller that may write the same message
 * twice sets `id`: a message whose `id` exists already is returned as it is. `html` is sanitized
 * (`html.ts`).
 */
export const postMessage = async (
  tx: Tx,
  author: { orgId: string; userId: string },
  conversation: { id: string; customerId: string; integrationId: string },
  written: Pick<
    Message,
    'content' | 'attachments' | 'internal' | 'mentionedUserIds' | 'replyToId'
  > &
    Partial<Pick<Message, 'id' | 'html' | 'surveyId' | 'providerData'>>,
) => {
  const [integration] = await tx
    .select({ kind: integrations.kind })
    .from(integrations)
    .where(eq(integrations.id, conversation.integrationId));

  const adapter = ADAPTERS.get(integration?.kind ?? '');

  if (!written.internal && adapter?.notesOnly)
    throw new ORPCError('BAD_REQUEST', { message: 'This conversation takes internal notes only' });

  const queued = !written.internal && Boolean(adapter?.send);

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
  const mentioned = sql`array(select distinct unnest(${conversations.mentionedUserIds} || ${sql.param(written.mentionedUserIds)}::text[]))`;

  await tx
    .update(conversations)
    .set(
      written.internal
        ? { participantIds: participants, mentionedUserIds: mentioned }
        : {
            participantIds: participants,
            mentionedUserIds: mentioned,
            content: written.content,
            messageCount: sql`${conversations.messageCount} + 1`,
            lastMessageAt: message.createdAt,
            customerRespondedLast: false,
            readBy: sql`array(select distinct unnest(array_append(${conversations.readBy}, ${author.userId})))`,
            status: statusFrom('new', 'open'),
            firstRespondedAt: sql`coalesce(${conversations.firstRespondedAt}, now())`,
            firstRespondedBy: sql`coalesce(${conversations.firstRespondedBy}, ${author.userId})`,
          },
    )
    .where(eq(conversations.id, conversation.id));

  if (queued) await queueSend(tx, author.orgId, message.id, message.id);

  // A note stays in the inbox, so the visitor hears only of a reply.
  await (written.internal
    ? signalMembers(tx, author.orgId, [conversation.id])
    : signalConversations(tx, author.orgId, [conversation]));

  return message;
};

/** Queues the reply for its adapter's `send`, once per `dedupeKey`. */
export const queueSend = (tx: Tx, orgId: string, messageId: string, dedupeKey: string) =>
  enqueueJob(tx, { orgId, name: JOBS.send.name, payload: { messageId }, dedupeKey });
