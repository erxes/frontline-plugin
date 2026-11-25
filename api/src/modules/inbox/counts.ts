import { and, asc, count, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { conversations, integrations } from '#/db/inbox.ts';
import { channelMembers, channels } from '#/db/schema.ts';
import { reads } from '#/orpc.ts';
import { membership, seenBy } from '../channels/access.ts';
import { readSql } from './shared.ts';

/**
 * How many open conversations wait unread by the caller: all they see, and each queue of the
 * inbox's sidebar (assigned to them, mentioning them, unassigned, awaiting a reply), and in each
 * channel they belong to, by name, and in each kind of active integration the channel has. A queue's
 * link filters the inbox by the same rule.
 */
const counts = reads(PERMISSIONS.inboxView)
  .route({
    summary:
      'Count your unread open conversations, in total and per inbox queue, channel and integration kind',
  })
  .input(z.object({}))
  .output(
    z.object({
      unread: z.number(),
      assignedToMe: z.number(),
      mentioned: z.number(),
      unassigned: z.number(),
      awaitingResponse: z.number(),
      channels: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          icon: z.string().nullable(),
          /** The caller's personal inbox, which the sidebar shows as My inbox. */
          personal: z.boolean(),
          unread: z.number(),
          /** The kinds of integration the channel has, such as `messenger`, each with its unread. */
          kinds: z.array(z.object({ kind: z.string(), unread: z.number() })),
        }),
      ),
    }),
  )
  .handler(async ({ context: { tx, member } }) => {
    const unread = and(ne(conversations.status, 'resolved'), sql`not ${readSql(member)}`);

    const [queues] = await tx
      .select({
        unread: count(),
        assignedToMe: count(
          sql`case when ${conversations.assigneeId} = ${member.userId} then 1 end`,
        ),
        mentioned: count(
          sql`case when ${member.userId} = any(${conversations.mentionedUserIds}) then 1 end`,
        ),
        unassigned: count(sql`case when ${conversations.assigneeId} is null then 1 end`),
        awaitingResponse: count(sql`case when ${conversations.customerRespondedLast} then 1 end`),
      })
      .from(conversations)
      .leftJoin(channelMembers, membership(member, conversations.channelId))
      .where(and(seenBy(member, conversations.channelId), unread));

    const rows = await tx
      .select({
        id: channels.id,
        name: channels.name,
        icon: channels.icon,
        personal: sql<boolean>`${channels.ownerId} is not null`,
        unread: count(conversations.id),
      })
      .from(channels)
      .innerJoin(channelMembers, membership(member, channels.id))
      .leftJoin(conversations, and(eq(conversations.channelId, channels.id), unread))
      .groupBy(channels.id)
      // The caller's personal inbox first, then the team channels.
      .orderBy(sql`${channels.ownerId} is null`, asc(channels.name));

    const kinds = await tx
      .select({
        channelId: integrations.channelId,
        kind: integrations.kind,
        unread: count(conversations.id),
      })
      .from(integrations)
      .innerJoin(channelMembers, membership(member, integrations.channelId))
      .leftJoin(conversations, and(eq(conversations.integrationId, integrations.id), unread))
      // An archived integration leaves the sidebar, as the old one did.
      .where(eq(integrations.isActive, true))
      .groupBy(integrations.channelId, integrations.kind)
      .orderBy(asc(integrations.kind));

    return {
      unread: queues?.unread ?? 0,
      assignedToMe: queues?.assignedToMe ?? 0,
      mentioned: queues?.mentioned ?? 0,
      unassigned: queues?.unassigned ?? 0,
      awaitingResponse: queues?.awaitingResponse ?? 0,
      channels: rows.map((row) => ({
        ...row,
        kinds: kinds
          .filter((kind) => kind.channelId === row.id)
          .map(({ kind, unread: kindUnread }) => ({ kind, unread: kindUnread })),
      })),
    };
  });

export const countProcedures = { counts };
