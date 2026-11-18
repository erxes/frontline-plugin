import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, eq, getTableColumns, inArray, isNotNull, type SQL, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { CONVERSATION_TIMELINE } from '#/core.ts';
import { PLUGIN } from '#/config.ts';
import type { Tx } from '#/db/client.ts';
import { conversations, conversationTags, integrations } from '#/db/inbox.ts';
import { channelMembers, channels } from '#/db/schema.ts';
import { managesAll, membership } from '../channels/access.ts';
import { publishEvents } from '../events.ts';

/** The row without `org_id`, which the caller already knows. */
// The custom field values load with the record's Properties tab, not with every row.
const {
  orgId: _orgId,
  propertiesData: _propertiesData,
  ...conversationColumns
} = getTableColumns(conversations);

/** The conversation's tag ids, for its row and the filter bar. */
export const tagIdsOf = sql<string[]>`array(
  select ${conversationTags.tagId} from ${conversationTags}
  where ${conversationTags.conversationId} = ${conversations.id}
  order by ${conversationTags.tagId}
)`;

/** Whether `member` read the conversation since the customer last wrote. */
export const readSql = (member: PluginMember) =>
  sql<boolean>`${member.userId} = any(${conversations.readBy})`;

/** The row, its integration's kind and name, its tags, and whether the caller read it. */
export const Conversation = createSelectSchema(conversations)
  .omit({ orgId: true, readBy: true, propertiesData: true })
  .extend({
    /** Its integration's adapter kind, such as `messenger`. */
    kind: z.string(),
    /** Its integration's name, which the list shows on hover of the kind's icon. */
    integrationName: z.string(),
    /** Its channel's name, which the list shows beside the customer. */
    channelName: z.string(),
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
      integrationName: integrations.name,
      channelName: channels.name,
      tagIds: tagIdsOf,
      isRead: readSql(member),
    })
    .from(conversations)
    .innerJoin(integrations, eq(integrations.id, conversations.integrationId))
    .innerJoin(channels, eq(channels.id, conversations.channelId))
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
  /** What the timeline shows; an event without one, such as an automation trigger, isn't shown. */
  summary: string | null;
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

/**
 * What a visitor's stream hears: a conversation changed or a member is typing in it, or one of
 * their tickets changed. Each names the conversation's or the ticket's id.
 */
export const VISITOR_EVENTS = ['changed', 'typing', 'ticket'] as const;

type Notified = { id: string; customerId: string };

const visitorNotices = (
  orgId: string,
  changed: Notified[],
  event: (typeof VISITOR_EVENTS)[number],
) =>
  changed.map(({ id, customerId }) => {
    const payload = JSON.stringify({ orgId, id, customerId, event });

    return sql`pg_notify(${VISITOR_CHANNEL}, ${payload})`;
  });

/** Sends `notices` in one statement; each goes out once the transaction commits. */
const send = (tx: Tx, notices: SQL[]) =>
  notices.length > 0 ? tx.execute(sql`select ${sql.join(notices, sql`, `)}`) : undefined;

/** Tells each conversation's visitor of `event` once the transaction commits. */
export const notifyVisitors = async (
  tx: Tx,
  orgId: string,
  changed: Notified[],
  event: (typeof VISITOR_EVENTS)[number] = 'changed',
) => {
  await send(tx, visitorNotices(orgId, changed, event));
};

/** The live topic a conversation's typing visitor signals on, for the members who have it open. */
export const typingTopic = (conversationId: string) => `typing.${conversationId.toLowerCase()}`;

/** The live topic of one conversation's changes, for the members who have it open. */
export const conversationTopic = (conversationId: string) =>
  `conversation.${conversationId.toLowerCase()}`;

/** `conversations` for the list and counts, then each changed conversation's own topic. */
const memberSignals = (orgId: string, ids: string[]) =>
  ['conversations', ...new Set(ids.map(conversationTopic))].map(
    (topic) => sql`core_live_signal(${orgId}, ${PLUGIN}, ${topic})`,
  );

/**
 * Tells the organisation's open inbox screens that the conversations of `ids` changed, once the
 * change commits: every screen hears `conversations`, and one showing a conversation hears its
 * `conversationTopic`. Neither carries the change: each refetches what it may see. Postgres sends
 * a signal once per transaction, however often it is raised in it.
 */
export const signalMembers = async (tx: Tx, orgId: string, ids: string[]) => {
  await send(tx, memberSignals(orgId, ids));
};

/**
 * Tells the members of the conversation's channel that its customer wrote, once the message
 * commits, for the inbox's new-message sound. The topic names the conversation, so a member
 * who has it open on screen hears nothing. A channel with no members tells no one.
 */
export const signalArrival = async (
  tx: Tx,
  orgId: string,
  conversation: { id: string; channelId: string },
) => {
  const topic = `arrived.${conversation.id.toLowerCase()}`;

  await tx.execute(sql`select core_live_signal(${orgId}, ${PLUGIN}, ${topic}, members.ids)
    from (select array_agg(${channelMembers.userId}) as ids from ${channelMembers}
      where ${channelMembers.channelId} = ${conversation.channelId}) members
    where members.ids is not null`);
};

/** Signals the members as `signalMembers` does, and tells each conversation's visitor. */
export const signalConversations = async (tx: Tx, orgId: string, changed: Notified[]) => {
  await send(tx, [
    ...memberSignals(
      orgId,
      changed.map(({ id }) => id),
    ),
    ...visitorNotices(orgId, changed, 'changed'),
  ]);
};
