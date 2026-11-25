import { and, asc, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import type { Tx } from '#/db/client.ts';
import { conversations, integrations, memberAvailability } from '#/db/inbox.ts';
import { channelMembers, channels, ReplyPolicy } from '#/db/schema.ts';
import { inOrder } from '../integrations/provider.ts';
import { assignConversations } from './assign.ts';
import { enqueueJob } from '@erxes/plugin-sdk';
import { JOBS } from '#/core.ts';

/** Whether the channel member takes conversations now: no row, or one that says available. */
const isAvailable = or(
  isNull(memberAvailability.status),
  eq(memberAvailability.status, 'available'),
);

/** The channel's members, each with whether they are away. */
const membersOf = (tx: Tx, channelId: string) =>
  tx
    .select({ userId: channelMembers.userId, role: channelMembers.role })
    .from(channelMembers)
    .leftJoin(memberAvailability, eq(memberAvailability.userId, channelMembers.userId))
    .where(and(eq(channelMembers.channelId, channelId), isAvailable));

/** The channel's available members, and its admins whether away or not. */
export const channelPeople = async (tx: Tx, channelId: string) => {
  const available = await membersOf(tx, channelId);

  const admins = await tx
    .select({ userId: channelMembers.userId })
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.role, 'admin')));

  return {
    available: available.map((row) => row.userId),
    admins: admins.map((row) => row.userId),
  };
};

/** How many open conversations the channel member has, in every channel. */
const openLoad = sql<number>`(select count(*)::int from ${conversations} held
  where held.assignee_id = ${channelMembers.userId} and held.status <> 'resolved')`;

/** When the channel member last got a conversation, so a tie goes to whoever waited longest. */
const lastAssigned = sql`(select max(held.assigned_at) from ${conversations} held
  where held.assignee_id = ${channelMembers.userId})`;

/**
 * The available member of the channel to give the next conversation to: the one with the fewest
 * open conversations, under the policy's `maxOpenPerMember`, then the one who got one longest
 * ago, and never `exclude`. Null when nobody qualifies. Picks for one channel run one at a time
 * (an advisory lock until the transaction ends), so two arrivals don't both go to the same member.
 */
export const nextAssignee = async (
  tx: Tx,
  orgId: string,
  channelId: string,
  policy: ReplyPolicy,
  exclude: string | null,
) => {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`frontline-assign:${orgId}:${channelId}`}, 0))`,
  );

  const [row] = await tx
    .select({ userId: channelMembers.userId })
    .from(channelMembers)
    .leftJoin(memberAvailability, eq(memberAvailability.userId, channelMembers.userId))
    .where(
      and(
        eq(channelMembers.channelId, channelId),
        isAvailable,
        exclude ? ne(channelMembers.userId, exclude) : undefined,
        policy.maxOpenPerMember ? sql`${openLoad} < ${policy.maxOpenPerMember}` : undefined,
      ),
    )
    .orderBy(asc(openLoad), sql`${lastAssigned} asc nulls first`, asc(channelMembers.userId))
    .limit(1);

  return row?.userId ?? null;
};

/**
 * Assigns each of the conversations of `ids` that waits unassigned in a channel that assigns
 * automatically to its next available member (`nextAssignee`), and tells them. One a core agent
 * still answers stays with the agent. Returns how many got an assignee.
 */
export const autoAssign = async (tx: Tx, orgId: string, ids?: string[]) => {
  const waiting = await tx
    .select({
      id: conversations.id,
      customerId: conversations.customerId,
      assigneeId: conversations.assigneeId,
      channelId: conversations.channelId,
      replyPolicy: channels.replyPolicy,
    })
    .from(conversations)
    .innerJoin(channels, eq(channels.id, conversations.channelId))
    .innerJoin(integrations, eq(integrations.id, conversations.integrationId))
    .where(
      and(
        ids ? inArray(conversations.id, ids) : undefined,
        isNull(conversations.assigneeId),
        isNotNull(conversations.waitingSince),
        ne(conversations.status, 'resolved'),
        sql`(${channels.replyPolicy} ->> 'autoAssign')::boolean`,
        or(eq(conversations.operator, 'person'), isNull(integrations.agentId)),
      ),
    )
    .orderBy(asc(conversations.waitingSince))
    .limit(200)
    .for('update', { of: conversations, skipLocked: true });

  const assigned = await inOrder(waiting, async (row) => {
    const policy = ReplyPolicy.parse(row.replyPolicy);
    const next = await nextAssignee(tx, orgId, row.channelId, policy, null);

    if (!next) return 0;

    await assignConversations(tx, orgId, null, [row], next, { reason: 'auto', notify: true });

    return 1;
  });

  return assigned.reduce<number>((sum, one) => sum + one, 0);
};

/**
 * After a customer's message: one who just started waiting while every member of the channel is
 * away is sent its `awayMessage` (a website messenger shows its own), then the conversation goes
 * to an available member when the channel assigns automatically.
 */
export const afterCustomerMessage = async (
  tx: Tx,
  orgId: string,
  conversation: { id: string; channelId: string; kind: string },
  { started, policy, messageId }: { started: boolean; policy: ReplyPolicy; messageId: string },
) => {
  if (started && policy.awayMessage && conversation.kind !== 'messenger') {
    const [someone] = await membersOf(tx, conversation.channelId).limit(1);

    // Sent by its own job (`replyCheck.ts`), as replies are: receiving knows no adapters.
    if (!someone)
      await enqueueJob(tx, {
        orgId,
        name: JOBS.awayReply.name,
        payload: { conversationId: conversation.id, messageId },
        dedupeKey: `away:${messageId}`,
      });
  }

  if (policy.autoAssign) await autoAssign(tx, orgId, [conversation.id]);
};
