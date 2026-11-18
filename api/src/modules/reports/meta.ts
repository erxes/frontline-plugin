import { and, type Column, count, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { conversations, integrations, messages } from '#/db/inbox.ts';
import { channelMembers } from '#/db/schema.ts';
import { reads } from '#/orpc.ts';
import { membership } from '../channels/access.ts';
import { seenBy } from '../inbox/shared.ts';
import { Count, countOn, countWhere, dayOf, everyDay, RangeInput, within } from './shared.ts';

const MetaReport = z.object({
  /** Messenger and Instagram direct conversations that started in the period. */
  conversations: Count,
  /** Of those, the ones the bot wrote in. */
  botConversations: Count,
  /** Messages written in direct conversations in the period, by who wrote them. */
  incoming: Count,
  staff: Count,
  bot: Count,
  /** Comments and replies under posts in the period, and the posts they were on. */
  comments: Count,
  posts: Count,
  days: z.array(
    z.object({ day: z.string(), conversations: Count, messages: Count, comments: Count }),
  ),
});

/** A conversation of one person's comments under one post: `comment:<post id>:<author id>`. */
const commentThread = sql`${conversations.externalId} like 'comment:%'`;

const direct = sql`not ${commentThread}`;

/** The thread's post, the middle of its external id. */
const postOf = sql`split_part(${conversations.externalId}, ':', 2)`;

/** A message from neither the customer nor a member: the bot's. */
const fromBot = sql`${messages.customerId} is null and ${messages.userId} is null`;

/**
 * The Facebook pages' and Instagram accounts' activity in the member's channels over a period:
 * direct conversations and who wrote their messages, how many the bot wrote in, and the
 * comments under posts, in total and by day.
 */
export const metaReport = reads(PERMISSIONS.inboxView)
  .input(RangeInput)
  .output(MetaReport)
  .handler(async ({ input: range, context: { tx, member } }) => {
    const theirs = tx
      .select({ id: conversations.id })
      .from(conversations)
      .innerJoin(integrations, eq(integrations.id, conversations.integrationId))
      .leftJoin(channelMembers, membership(member, conversations.channelId))
      .where(and(seenBy(member), inArray(integrations.kind, ['facebook', 'instagram'])));

    const started = and(
      inArray(conversations.id, theirs),
      direct,
      within(conversations.createdAt, range),
    );

    const written = and(
      inArray(messages.conversationId, theirs),
      within(messages.createdAt, range),
      eq(messages.internal, false),
    );

    const botWrote = sql`exists (select 1 from ${messages} where ${messages.conversationId} = ${conversations.id} and ${fromBot})`;

    const [opened] = await tx
      .select({ conversations: count(), botConversations: countWhere(botWrote) })
      .from(conversations)
      .where(started);

    const fromMessages = (where: SQL | undefined) =>
      tx
        .select({ day: dayOf(messages.createdAt, range), count: count() })
        .from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .where(and(written, where))
        .groupBy(sql`1`);

    const [totals] = await tx
      .select({
        incoming: countWhere(and(direct, sql`${messages.customerId} is not null`)),
        staff: countWhere(and(direct, sql`${messages.userId} is not null`)),
        bot: countWhere(and(direct, fromBot)),
        comments: countWhere(commentThread),
        posts: sql<number>`count(distinct ${postOf}) filter (where ${commentThread})`.mapWith(
          Number,
        ),
      })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(written);

    const perDay = (column: Column) =>
      tx
        .select({ day: dayOf(column, range), count: count() })
        .from(conversations)
        .where(started)
        .groupBy(sql`1`);

    const startedOn = countOn(await perDay(conversations.createdAt));
    const messagesOn = countOn(await fromMessages(direct));
    const commentsOn = countOn(await fromMessages(commentThread));

    return {
      conversations: opened?.conversations ?? 0,
      botConversations: opened?.botConversations ?? 0,
      incoming: totals?.incoming ?? 0,
      staff: totals?.staff ?? 0,
      bot: totals?.bot ?? 0,
      comments: totals?.comments ?? 0,
      posts: totals?.posts ?? 0,
      days: everyDay(range).map((day) => ({
        day,
        conversations: startedOn(day),
        messages: messagesOn(day),
        comments: commentsOn(day),
      })),
    };
  });
