import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { conversations, integrations, messages } from '#/db/inbox.ts';
import { channelMembers } from '#/db/schema.ts';
import { compileFilter } from '@erxes/plugin-sdk/filter';
import { reads } from '#/orpc.ts';
import { membership, seenBy } from '../channels/access.ts';
import { conversationFilter } from '../inbox/conversations.ts';
import { COMMENT_THREAD } from '../integrations/providers/metaWebhook.ts';
import { Count, countWhere, dayOf, everyDay, ReportInput, TOP, within } from './shared.ts';

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
  /** The posts with the most comments in the period, and a thread under each to read it by. */
  topPosts: z.array(
    z.object({
      postId: z.string(),
      conversationId: z.string(),
      /** What customers wrote under it, and what members replied. */
      comments: Count,
      replies: Count,
      commenters: Count,
      lastActivityAt: z.date(),
    }),
  ),
  days: z.array(
    z.object({ day: z.string(), conversations: Count, messages: Count, comments: Count }),
  ),
});

const commentThread = sql`coalesce(${conversations.externalId} like ${`${COMMENT_THREAD}%`}, false)`;

const direct = sql`not ${commentThread}`;

/** The thread's post, the middle of its external id. */
const postOf = sql`split_part(${conversations.externalId}, ':', 2)`;

/** A message from neither the customer nor a member: the bot's. */
const fromBot = sql`${messages.customerId} is null and ${messages.userId} is null`;

const sum = <Row>(rows: Row[], pick: (row: Row) => number) =>
  rows.reduce((total, row) => total + pick(row), 0);

/**
 * The Facebook pages' and Instagram accounts' activity in the member's channels the card's filter
 * keeps, over a period:
 * direct conversations and who wrote their messages, how many the bot wrote in, and the
 * comments under posts, in total and by day.
 */
export const metaReport = reads(PERMISSIONS.inboxView)
  .input(ReportInput)
  .output(MetaReport)
  .handler(async ({ input: range, context: { tx, member } }) => {
    const theirs = tx
      .select({ id: conversations.id })
      .from(conversations)
      .innerJoin(integrations, eq(integrations.id, conversations.integrationId))
      .leftJoin(channelMembers, membership(member, conversations.channelId))
      .where(
        and(
          seenBy(member, conversations.channelId),
          compileFilter(conversationFilter(member), range.filter, { me: member.userId }),
          inArray(integrations.kind, ['facebook', 'instagram']),
        ),
      );

    const written = and(
      inArray(messages.conversationId, theirs),
      within(messages.createdAt, range),
      eq(messages.internal, false),
    );

    const botWrote = sql`exists (select 1 from ${messages} where ${messages.conversationId} = ${conversations.id} and ${fromBot})`;

    const opened = await tx
      .select({
        day: dayOf(conversations.createdAt, range),
        conversations: count(),
        botConversations: countWhere(botWrote),
      })
      .from(conversations)
      .where(and(inArray(conversations.id, theirs), direct, within(conversations.createdAt, range)))
      .groupBy(sql`1`);

    const wrote = await tx
      .select({
        day: dayOf(messages.createdAt, range),
        messages: countWhere(direct),
        incoming: countWhere(and(direct, sql`${messages.customerId} is not null`)),
        staff: countWhere(and(direct, sql`${messages.userId} is not null`)),
        bot: countWhere(and(direct, fromBot)),
        comments: countWhere(commentThread),
      })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(written)
      .groupBy(sql`1`);

    // A post is commented on across days, so its count is not a sum of the days'.
    const [commented] = await tx
      .select({ posts: sql<number>`count(distinct ${postOf})`.mapWith(Number) })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(and(written, commentThread));

    const topPosts = await tx
      .select({
        postId: sql<string>`${postOf}`,
        conversationId: sql<string>`min(${conversations.id})`,
        comments: countWhere(sql`${messages.customerId} is not null`),
        replies: countWhere(sql`${messages.userId} is not null`),
        commenters: sql<number>`count(distinct ${messages.customerId})`.mapWith(Number),
        lastActivityAt: sql<Date>`max(${messages.createdAt})`.mapWith(messages.createdAt),
      })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(and(written, commentThread))
      .groupBy(sql`1`)
      .orderBy(desc(count()), sql`1`)
      .limit(TOP);

    const openedOn = new Map(opened.map((row) => [row.day, row]));
    const wroteOn = new Map(wrote.map((row) => [row.day, row]));

    return {
      conversations: sum(opened, (row) => row.conversations),
      botConversations: sum(opened, (row) => row.botConversations),
      incoming: sum(wrote, (row) => row.incoming),
      staff: sum(wrote, (row) => row.staff),
      bot: sum(wrote, (row) => row.bot),
      comments: sum(wrote, (row) => row.comments),
      posts: commented?.posts ?? 0,
      topPosts,
      days: everyDay(range).map((day) => ({
        day,
        conversations: openedOn.get(day)?.conversations ?? 0,
        messages: wroteOn.get(day)?.messages ?? 0,
        comments: wroteOn.get(day)?.comments ?? 0,
      })),
    };
  });
