import { and, type Column, count, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { channelMembers } from '#/db/schema.ts';
import { tags } from '#/db/tags.ts';
import { pipelineStatuses, STATUS_TYPES, tickets } from '#/db/tickets.ts';
import { reads } from '#/orpc.ts';
import { membership } from '../channels/access.ts';
import { firstResponseSla, resolutionSla, seenBy } from '../tickets/shared.ts';
import {
  averageSeconds,
  Count,
  countOn,
  countWhere,
  dayOf,
  everyDay,
  RangeInput,
  secondsBetween,
  TOP,
  TagCount,
  within,
} from './shared.ts';

const TicketReport = z.object({
  /** Tickets created in the period. */
  created: Count,
  /** Tickets resolved in the period. */
  resolved: Count,
  /** Active tickets in a stage before Resolved now, whenever they were created. */
  unresolved: Count,
  /** Of those, the ones past an SLA due time. */
  overdue: Count,
  /** From creation to resolution, over the tickets resolved in the period. */
  resolutionSeconds: z.number().nullable(),
  days: z.array(z.object({ day: z.string(), created: Count, resolved: Count })),
  /** The period's new tickets by the stage (`STATUS_TYPES`) of their status now. */
  stages: z.array(z.object({ type: z.number().int(), count: Count })),
  /** The period's new tickets by priority, 0 none to 4 critical. */
  priorities: z.array(z.object({ priority: z.number().int(), count: Count })),
  /** The period's new tickets by tag. */
  tags: z.array(TagCount),
});

/** The tickets `created` picks by the stage they are in now, by priority and by tag. */
const breakdowns = async (tx: Tx, created: SQL | undefined) => {
  const stages = await tx
    .select({ type: pipelineStatuses.type, count: count() })
    .from(tickets)
    .innerJoin(pipelineStatuses, eq(pipelineStatuses.id, tickets.statusId))
    .where(created)
    .groupBy(pipelineStatuses.type)
    .orderBy(pipelineStatuses.type);

  const priorities = await tx
    .select({ priority: tickets.priority, count: count() })
    .from(tickets)
    .where(created)
    .groupBy(tickets.priority)
    .orderBy(desc(tickets.priority));

  const tagged = await tx
    .select({ tagId: tags.id, name: tags.name, colorCode: tags.colorCode, count: count() })
    .from(tickets)
    .innerJoin(tags, sql`${tags.id} = any(${tickets.tagIds})`)
    .where(created)
    .groupBy(tags.id)
    .orderBy(desc(count()), tags.name)
    .limit(TOP);

  return { stages, priorities, tags: tagged };
};

/**
 * The tickets of the member's channels over a period, as their pipelines let them see them:
 * how many came and were resolved, by day, stage, priority and tag, and what is overdue now.
 */
export const ticketReport = reads(PERMISSIONS.channelView)
  .input(RangeInput)
  .output(TicketReport)
  .handler(async ({ input: range, context: { tx, member } }) => {
    const mine = inArray(
      tickets.id,
      tx
        .select({ id: tickets.id })
        .from(tickets)
        .leftJoin(channelMembers, membership(member, tickets.channelId))
        .where(seenBy(member)),
    );

    const created = and(mine, within(tickets.createdAt, range));
    const resolved = within(tickets.resolvedAt, range);
    const unresolved = sql`${tickets.state} = 'active' and ${pipelineStatuses.type} < ${STATUS_TYPES.resolved}`;

    const perDay = (column: Column) =>
      tx
        .select({ day: dayOf(column, range), count: count() })
        .from(tickets)
        .where(and(mine, within(column, range)))
        .groupBy(sql`1`);

    const [totals] = await tx
      .select({
        created: countWhere(created),
        resolved: countWhere(resolved),
        unresolved: countWhere(unresolved),
        overdue: countWhere(
          sql`${unresolved} and 'overdue' in (${firstResponseSla}, ${resolutionSla})`,
        ),
        resolutionSeconds: averageSeconds(
          secondsBetween(tickets.createdAt, tickets.resolvedAt),
          resolved,
        ),
      })
      .from(tickets)
      .innerJoin(pipelineStatuses, eq(pipelineStatuses.id, tickets.statusId))
      .where(mine);

    const createdOn = countOn(await perDay(tickets.createdAt));
    const resolvedOn = countOn(await perDay(tickets.resolvedAt));

    return {
      created: totals?.created ?? 0,
      resolved: totals?.resolved ?? 0,
      unresolved: totals?.unresolved ?? 0,
      overdue: totals?.overdue ?? 0,
      resolutionSeconds: totals?.resolutionSeconds ?? null,
      days: everyDay(range).map((day) => ({
        day,
        created: createdOn(day),
        resolved: resolvedOn(day),
      })),
      ...(await breakdowns(tx, created)),
    };
  });
