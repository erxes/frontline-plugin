import type { PluginJobDelivery } from '@erxes/core-contract';
import { and, asc, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CONVERSATION_EVENTS } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { conversations, integrations } from '#/db/inbox.ts';
import { channels, ReplyPolicy } from '#/db/schema.ts';
import { inOrder } from '../integrations/provider.ts';
import { ADAPTERS } from './adapters.ts';
import { assignConversations } from './assign.ts';
import { addBotMessage } from './operator.ts';
import { autoAssign, channelPeople, nextAssignee } from './replies.ts';
import {
  type ConversationEvent,
  publishConversationEvents,
  signalConversations,
  signalMembers,
} from './shared.ts';

const minutesOf = (key: keyof ReplyPolicy) =>
  sql`make_interval(mins => (${channels.replyPolicy} ->> ${key})::int)`;

/** A reply is warned of once its channel's `warnBeforeMinutes` before it is due, then overdue. */
const STAGES = {
  warning: {
    reached: sql`${channels.replyPolicy} ->> 'warnBeforeMinutes' is not null
      and now() >= ${conversations.replyDueAt} - ${minutesOf('warnBeforeMinutes')}
      and now() < ${conversations.replyDueAt}`,
    stamp: conversations.replyWarnedAt,
    set: { replyWarnedAt: sql`now()` },
    event: CONVERSATION_EVENTS.replyDueSoon,
    title: 'A reply is due soon',
  },
  breach: {
    reached: sql`now() >= ${conversations.replyDueAt}`,
    stamp: conversations.replyBreachedAt,
    set: { replyBreachedAt: sql`now()` },
    event: CONVERSATION_EVENTS.replyOverdue,
    title: 'A reply is overdue',
  },
} as const;

type Stage = keyof typeof STAGES;

/**
 * Who hears that a reply is due: its assignee, else the channel's available members. An overdue
 * one also reaches the channel's admins, whose team owes it.
 */
const audienceOf = async (
  tx: Tx,
  stage: Stage,
  row: { channelId: string; assigneeId: string | null },
) => {
  const { available, admins } = await channelPeople(tx, row.channelId);
  const owners = row.assigneeId ? [row.assigneeId] : available;

  return [...new Set(stage === 'breach' ? [...owners, ...admins] : owners)];
};

/**
 * Stamps the waiting conversations whose reply reached `stage` and weren't told of it, and returns
 * their events: on the conversation's timeline, for automations, and to the members who owe the
 * reply. A reply past due warns no more.
 */
const reach = async (tx: Tx, stage: Stage): Promise<ConversationEvent[]> => {
  const { reached, stamp, set, event, title } = STAGES[stage];

  const rows = await tx
    .update(conversations)
    .set(set)
    .from(channels)
    .where(
      and(
        eq(channels.id, conversations.channelId),
        ne(conversations.status, 'resolved'),
        isNotNull(conversations.waitingSince),
        isNotNull(conversations.replyDueAt),
        isNull(conversations.replyBreachedAt),
        isNull(stamp),
        reached,
      ),
    )
    .returning({
      id: conversations.id,
      customerId: conversations.customerId,
      channelId: conversations.channelId,
      assigneeId: conversations.assigneeId,
      waitingSince: conversations.waitingSince,
      dueAt: conversations.replyDueAt,
    });

  return inOrder(rows, async (row) => ({
    conversationId: row.id,
    customerId: row.customerId,
    type: event.type,
    summary: stage === 'warning' ? 'The reply is due soon' : 'The reply is overdue',
    payload: {
      conversationId: row.id,
      channelId: row.channelId,
      assigneeId: row.assigneeId,
      waitingSince: row.waitingSince?.toISOString() ?? null,
      dueAt: row.dueAt?.toISOString() ?? null,
    },
    notify: { userIds: await audienceOf(tx, stage, row), title },
  }));
};

/**
 * Moves each conversation whose assignee left its customer waiting the channel's
 * `reassignAfterMinutes`, since the wait began or they got it, to the channel's next available
 * member, who hears of it. One with nobody else to take it stays where it is; its overdue notice
 * reaches the channel's admins. Returns how many moved.
 */
const reassignUnanswered = async (tx: Tx, orgId: string) => {
  const since = sql`greatest(${conversations.waitingSince}, coalesce(${conversations.assignedAt}, ${conversations.waitingSince}))`;

  const rows = await tx
    .select({
      id: conversations.id,
      customerId: conversations.customerId,
      assigneeId: conversations.assigneeId,
      channelId: conversations.channelId,
      replyPolicy: channels.replyPolicy,
    })
    .from(conversations)
    .innerJoin(channels, eq(channels.id, conversations.channelId))
    .where(
      and(
        ne(conversations.status, 'resolved'),
        isNotNull(conversations.assigneeId),
        isNotNull(conversations.waitingSince),
        sql`${channels.replyPolicy} ->> 'reassignAfterMinutes' is not null`,
        sql`now() >= ${since} + ${minutesOf('reassignAfterMinutes')}`,
      ),
    )
    .orderBy(asc(conversations.waitingSince))
    .limit(200)
    .for('update', { of: conversations, skipLocked: true });

  const moved = await inOrder(rows, async (row) => {
    const policy = ReplyPolicy.parse(row.replyPolicy);
    const next = await nextAssignee(tx, orgId, row.channelId, policy, row.assigneeId);

    if (!next) return 0;

    await assignConversations(tx, orgId, null, [row], next, {
      reason: 'unanswered',
      notify: true,
      payload: { afterMinutes: policy.reassignAfterMinutes },
    });

    return 1;
  });

  return moved.reduce<number>((sum, one) => sum + one, 0);
};

/**
 * The reply check core runs every minute for each organisation (`JOBS.replies`), by each
 * channel's `replyPolicy`: warns before a waiting customer's reply is due and once it is overdue,
 * reassigns the conversations an assignee left unanswered, then assigns the waiting ones nobody
 * has to available members. Each notice is stamped in the transaction that publishes it, so a
 * rerun sends nothing twice.
 */
export const checkReplies = (orgId: string) =>
  withOrg(orgId, async (tx) => {
    const warned = await reach(tx, 'warning');
    const breached = await reach(tx, 'breach');
    const notices = [...warned, ...breached];

    await publishConversationEvents(tx, orgId, null, notices);

    if (notices.length > 0)
      await signalMembers(
        tx,
        orgId,
        notices.map((notice) => notice.conversationId),
      );

    const reassigned = await reassignUnanswered(tx, orgId);
    const assigned = await autoAssign(tx, orgId);

    return { warned: warned.length, breached: breached.length, reassigned, assigned };
  });

const AwayReply = z.object({ conversationId: z.string(), messageId: z.string() });

/**
 * Sends the channel's away message into the conversation whose customer wrote `messageId` while
 * every member was away (`JOBS.awayReply`), once: the reply's id comes from the message. A
 * conversation that takes no replies, or a channel that dropped its away message, gets none.
 */
export const sendAwayReply = (job: PluginJobDelivery) =>
  withOrg(job.orgId, async (tx) => {
    const { conversationId, messageId } = AwayReply.parse(job.payload);

    const [row] = await tx
      .select({
        id: conversations.id,
        customerId: conversations.customerId,
        kind: integrations.kind,
        replyPolicy: channels.replyPolicy,
      })
      .from(conversations)
      .innerJoin(integrations, eq(integrations.id, conversations.integrationId))
      .innerJoin(channels, eq(channels.id, conversations.channelId))
      .where(eq(conversations.id, conversationId))
      .for('update', { of: conversations });

    const adapter = row && ADAPTERS.get(row.kind);
    const awayMessage = row && ReplyPolicy.parse(row.replyPolicy).awayMessage;

    if (!row || !awayMessage || !adapter?.send || adapter.notesOnly) return { sent: false };

    const sent = await addBotMessage(tx, job.orgId, row, awayMessage, {
      id: `${messageId}-away`,
      answers: false,
    });

    if (sent) await signalConversations(tx, job.orgId, [row]);

    return { sent };
  });
