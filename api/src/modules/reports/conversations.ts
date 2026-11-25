import {
  and,
  type Column,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  isNotNull,
  ne,
  type SQL,
  sql,
} from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { conversations, conversationTags, integrations, messages } from '#/db/inbox.ts';
import { channelMembers } from '#/db/schema.ts';
import { tags } from '#/db/tags.ts';
import { compileFilter } from '@erxes/plugin-sdk/filter';
import { reads } from '#/orpc.ts';
import { membership, seenBy } from '../channels/access.ts';
import { conversationFilter } from '../inbox/conversations.ts';
import {
  averageSeconds,
  Count,
  countOn,
  countWhere,
  dayOf,
  everyDay,
  ReportInput,
  secondsBetween,
  TOP,
  TagCount,
  within,
} from './shared.ts';

const ConversationReport = z.object({
  /** Conversations that started in the period. */
  started: Count,
  /** Conversations resolved in the period. */
  resolved: Count,
  /** Conversations not resolved now, whenever they started. */
  unresolved: Count,
  /** From start to a member's first reply, over the conversations first answered in the period. */
  firstResponseSeconds: z.number().nullable(),
  /** From start to resolution, over the conversations resolved in the period. */
  resolutionSeconds: z.number().nullable(),
  /** How long customers waited for each reply, a member's or the bot's, sent in the period. */
  replySeconds: z.number().nullable(),
  /** The period's replies that ended a wait with a target, and those that came by it. */
  replies: z.object({ withTarget: Count, onTime: Count }),
  /** Conversations whose customer waits past the reply target now. */
  overdue: Count,
  days: z.array(z.object({ day: z.string(), started: Count, resolved: Count })),
  /** The conversations that started in the period, by their integration's kind. */
  sources: z.array(z.object({ kind: z.string(), count: Count })),
  /** The conversations that started in the period, by tag. */
  tags: z.array(TagCount),
  /**
   * Each member's replies to customers in the period, the conversations they went to, and how
   * long the customers they answered had waited.
   */
  members: z.array(
    z.object({
      userId: z.string(),
      replies: Count,
      conversations: Count,
      replySeconds: z.number().nullable(),
    }),
  ),
});

/**
 * The conversations `started` picks by source and by tag, and who wrote the messages `replied`
 * picks, members only and no internal notes.
 */
const breakdowns = async (tx: Tx, started: SQL | undefined, replied: SQL | undefined) => {
  const sources = await tx
    .select({ kind: integrations.kind, count: count() })
    .from(conversations)
    .innerJoin(integrations, eq(integrations.id, conversations.integrationId))
    .where(started)
    .groupBy(integrations.kind)
    .orderBy(desc(count()), integrations.kind)
    .limit(TOP);

  const tagged = await tx
    .select({ tagId: tags.id, name: tags.name, colorCode: tags.colorCode, count: count() })
    .from(conversations)
    .innerJoin(conversationTags, eq(conversationTags.conversationId, conversations.id))
    .innerJoin(tags, eq(tags.id, conversationTags.tagId))
    .where(started)
    .groupBy(tags.id)
    .orderBy(desc(count()), tags.name)
    .limit(TOP);

  const members = await tx
    .select({
      userId: sql<string>`${messages.userId}`,
      replies: count(),
      conversations: countDistinct(messages.conversationId),
      replySeconds: averageSeconds(messages.waitedSeconds),
    })
    .from(messages)
    .where(and(replied, isNotNull(messages.userId), eq(messages.internal, false)))
    .groupBy(messages.userId)
    .orderBy(desc(count()), messages.userId)
    .limit(TOP);

  return { sources, tags: tagged, members };
};

/**
 * The conversations of the member's channels the card's filter keeps, over a period: how many
 * started and were resolved, how fast, by day, by source and tag, and who answered.
 */
export const conversationReport = reads(PERMISSIONS.inboxView)
  .route({
    summary:
      'Report conversations started, resolved and answered from/to (ISO date-times) by day in an IANA timeZone, with reply waits and targets met; times in seconds',
  })
  .input(ReportInput)
  .output(ConversationReport)
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
        ),
      );

    const mine = inArray(conversations.id, theirs);
    const started = and(mine, within(conversations.createdAt, range));
    const resolved = within(conversations.resolvedAt, range);

    const perDay = (column: Column) =>
      tx
        .select({ day: dayOf(column, range), count: count() })
        .from(conversations)
        .where(and(mine, within(column, range)))
        .groupBy(sql`1`);

    const replied = and(
      inArray(messages.conversationId, theirs),
      within(messages.createdAt, range),
    );

    const [totals] = await tx
      .select({
        started: countWhere(started),
        resolved: countWhere(resolved),
        unresolved: countWhere(ne(conversations.status, 'resolved')),
        overdue: countWhere(
          and(isNotNull(conversations.waitingSince), isNotNull(conversations.replyBreachedAt)),
        ),
        firstResponseSeconds: averageSeconds(
          secondsBetween(conversations.createdAt, conversations.firstRespondedAt),
          within(conversations.firstRespondedAt, range),
        ),
        resolutionSeconds: averageSeconds(
          secondsBetween(conversations.createdAt, conversations.resolvedAt),
          resolved,
        ),
      })
      .from(conversations)
      .where(mine);

    const [answers] = await tx
      .select({
        replySeconds: averageSeconds(messages.waitedSeconds),
        withTarget: countWhere(isNotNull(messages.replyOnTime)),
        onTime: countWhere(eq(messages.replyOnTime, true)),
      })
      .from(messages)
      .where(and(replied, isNotNull(messages.waitedSeconds)));

    const startedOn = countOn(await perDay(conversations.createdAt));
    const resolvedOn = countOn(await perDay(conversations.resolvedAt));

    return {
      started: totals?.started ?? 0,
      resolved: totals?.resolved ?? 0,
      unresolved: totals?.unresolved ?? 0,
      firstResponseSeconds: totals?.firstResponseSeconds ?? null,
      resolutionSeconds: totals?.resolutionSeconds ?? null,
      replySeconds: answers?.replySeconds ?? null,
      replies: { withTarget: answers?.withTarget ?? 0, onTime: answers?.onTime ?? 0 },
      overdue: totals?.overdue ?? 0,
      days: everyDay(range).map((day) => ({
        day,
        started: startedOn(day),
        resolved: resolvedOn(day),
      })),
      ...(await breakdowns(tx, started, replied)),
    };
  });
