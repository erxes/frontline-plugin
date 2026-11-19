import {
  and,
  type Column,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  isNotNull,
  type SQL,
  sql,
} from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { conversations, conversationTags, integrations, messages } from '#/db/inbox.ts';
import { channelMembers } from '#/db/schema.ts';
import { tags } from '#/db/tags.ts';
import { reads } from '#/orpc.ts';
import { membership, seenBy } from '../channels/access.ts';
import {
  averageSeconds,
  ChannelRangeInput,
  Count,
  countOn,
  countWhere,
  dayOf,
  everyDay,
  inChannel,
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
  days: z.array(z.object({ day: z.string(), started: Count, resolved: Count })),
  /** The conversations that started in the period, by their integration's kind. */
  sources: z.array(z.object({ kind: z.string(), count: Count })),
  /** The conversations that started in the period, by tag. */
  tags: z.array(TagCount),
  /** Each member's replies to customers in the period, and the conversations they went to. */
  members: z.array(z.object({ userId: z.string(), replies: Count, conversations: Count })),
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
    })
    .from(messages)
    .where(and(replied, isNotNull(messages.userId), eq(messages.internal, false)))
    .groupBy(messages.userId)
    .orderBy(desc(count()), messages.userId)
    .limit(TOP);

  return { sources, tags: tagged, members };
};

/**
 * The conversations of the member's channels, or of one of them, over a period: how many started
 * and were resolved, how fast, by day, by source and tag, and who answered.
 */
export const conversationReport = reads(PERMISSIONS.inboxView)
  .input(ChannelRangeInput)
  .output(ConversationReport)
  .handler(async ({ input: range, context: { tx, member } }) => {
    const theirs = tx
      .select({ id: conversations.id })
      .from(conversations)
      .leftJoin(channelMembers, membership(member, conversations.channelId))
      .where(and(seenBy(member, conversations.channelId), inChannel(range)));

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
        unresolved: countWhere(sql`${conversations.status} <> 'resolved'`),
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

    const startedOn = countOn(await perDay(conversations.createdAt));
    const resolvedOn = countOn(await perDay(conversations.resolvedAt));

    return {
      started: totals?.started ?? 0,
      resolved: totals?.resolved ?? 0,
      unresolved: totals?.unresolved ?? 0,
      firstResponseSeconds: totals?.firstResponseSeconds ?? null,
      resolutionSeconds: totals?.resolutionSeconds ?? null,
      days: everyDay(range).map((day) => ({
        day,
        started: startedOn(day),
        resolved: resolvedOn(day),
      })),
      ...(await breakdowns(tx, started, replied)),
    };
  });
