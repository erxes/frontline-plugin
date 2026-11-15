import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, eq, getTableColumns, inArray, isNotNull, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { CONVERSATION_TIMELINE } from '#/core.ts';
import { PLUGIN } from '#/config.ts';
import type { Tx } from '#/db/client.ts';
import { conversations, conversationTags, integrations } from '#/db/inbox.ts';
import { channelMembers } from '#/db/schema.ts';
import { managesAll, membership } from '../channels/access.ts';
import { publishEvents } from '../events.ts';

/** The row without `org_id`, which the caller already knows. */
const { orgId: _orgId, ...conversationColumns } = getTableColumns(conversations);

/** The conversation's tag ids, for its row and the filter bar. */
export const tagIdsOf = sql<string[]>`array(
  select ${conversationTags.tagId} from ${conversationTags}
  where ${conversationTags.conversationId} = ${conversations.id}
  order by ${conversationTags.tagId}
)`;

/** Whether `member` read the conversation since the customer last wrote. */
export const readSql = (member: PluginMember) =>
  sql<boolean>`${member.userId} = any(${conversations.readBy})`;

/** The row, its integration's kind and tags, and whether the caller read it. */
export const Conversation = createSelectSchema(conversations)
  .omit({ orgId: true, readBy: true })
  .extend({
    /** Its integration's adapter kind, such as `messenger`. */
    kind: z.string(),
    tagIds: z.array(z.string()),
    isRead: z.boolean(),
  });

/** The conversations `member` sees: their channels', or every channel's for one who manages them all. */
export const seenBy = (member: PluginMember) =>
  managesAll(member) ? undefined : isNotNull(channelMembers.userId);

/** Conversations as the caller sees them. Callers narrow them with `seenBy`. */
export const conversationRows = (tx: Tx, member: PluginMember) => {
  const { readBy, ...columns } = conversationColumns;

  return tx
    .select({
      ...columns,
      kind: integrations.kind,
      tagIds: tagIdsOf,
      isRead: readSql(member),
    })
    .from(conversations)
    .innerJoin(integrations, eq(integrations.id, conversations.integrationId))
    .leftJoin(channelMembers, membership(member, conversations.channelId))
    .$dynamic();
};

/** One conversation as the caller sees it, or NOT_FOUND. */
export const conversationById = async (tx: Tx, member: PluginMember, id: string) => {
  const [conversation] = await conversationRows(tx, member).where(
    and(eq(conversations.id, id), seenBy(member)),
  );

  if (!conversation) throw new ORPCError('NOT_FOUND', { message: 'No such conversation' });

  return conversation;
};

/** Up to 100 distinct conversation ids, as a selection sends them. */
export const Ids = z
  .array(z.string())
  .min(1)
  .max(100)
  .transform((ids) => [...new Set(ids)]);

/**
 * The conversations of `ids` the caller sees, locked for the rest of the transaction, all of
 * them or NOT_FOUND. Locked in id order, so two changes to the same conversations can't deadlock.
 */
export const conversationsFor = async (tx: Tx, member: PluginMember, ids: string[]) => {
  const rows = await tx
    .select(conversationColumns)
    .from(conversations)
    .leftJoin(channelMembers, membership(member, conversations.channelId))
    .where(and(inArray(conversations.id, ids), seenBy(member)))
    .orderBy(conversations.id)
    .for('update', { of: conversations });

  if (rows.length !== ids.length)
    throw new ORPCError('NOT_FOUND', { message: 'No such conversation' });

  return rows;
};

/** One entry on a conversation's timeline in core, and on its customer's. */
export type ConversationEvent = {
  conversationId: string;
  customerId: string;
  type: string;
  summary: string;
  payload: Record<string, unknown>;
};

/**
 * Publishes the events with core's `core_publish_event()` in the caller's transaction, so they
 * land on the conversation's and its customer's Activity tab exactly when the change commits.
 * `actorId` is the member who acted; without one the plugin did.
 */
export const publishConversationEvents = (
  tx: Tx,
  orgId: string,
  actorId: string | null,
  events: ConversationEvent[],
) =>
  publishEvents(
    tx,
    {
      orgId,
      actorUserId: actorId,
      entityType: CONVERSATION_TIMELINE,
      linkOf: (id) => `/${PLUGIN}/inbox?conversationId=${encodeURIComponent(id)}`,
      audited: false,
    },
    events.map(({ conversationId, ...event }) => ({ ...event, entityId: conversationId })),
  );

/** The Postgres channel the public messenger stream listens on (`messenger/stream.ts`). */
export const VISITOR_CHANNEL = 'frontline_visitors';

/** What a visitor's stream hears: a conversation changed, or a member is typing in it. */
export const VISITOR_EVENTS = ['changed', 'typing'] as const;

type Notified = { id: string; customerId: string };

/** Tells each conversation's visitor of `event` once the transaction commits. */
export const notifyVisitors = async (
  tx: Tx,
  orgId: string,
  changed: Notified[],
  event: (typeof VISITOR_EVENTS)[number] = 'changed',
) => {
  if (changed.length === 0) return;

  const notices = changed.map(({ id, customerId }) => {
    const payload = JSON.stringify({ orgId, conversationId: id, customerId, event });

    return sql`pg_notify(${VISITOR_CHANNEL}, ${payload})`;
  });

  await tx.execute(sql`select ${sql.join(notices, sql`, `)}`);
};

/** The live topic a conversation's typing visitor signals on, for the members who have it open. */
export const typingTopic = (conversationId: string) => `typing.${conversationId.toLowerCase()}`;

/**
 * Tells the organisation's open inbox screens to refetch, and the conversation's visitor, once
 * the change commits. Neither carries the message: each refetches what it may see.
 */
export const signalConversations = async (tx: Tx, orgId: string, changed: Notified[]) => {
  await tx.execute(sql`select core_live_signal(${orgId}, ${PLUGIN}, 'conversations')`);
  await notifyVisitors(tx, orgId, changed);
};
