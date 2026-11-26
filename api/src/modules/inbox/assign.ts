import { and, eq, inArray, sql } from 'drizzle-orm';
import { CONVERSATION_EVENTS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { conversations } from '#/db/inbox.ts';
import { publishConversationEvents, signalConversations } from './shared.ts';

/**
 * A member replied in the conversations or was assigned them, so the bot stops answering. The
 * reply or the assignee speaks for itself: the customer gets no hand-off message.
 */
export const takeOver = (tx: Tx, ids: string[]) =>
  tx
    .update(conversations)
    .set({ operator: 'person' })
    .where(and(inArray(conversations.id, ids), eq(conversations.operator, 'bot')));

/**
 * Who assigned it: a member, an automation step, the channel's auto-assignment, its reassignment of
 * one the assignee left unanswered, or the member who picked up its call.
 */
export const ASSIGN_REASONS = ['member', 'automation', 'auto', 'unanswered', 'call'] as const;

type Row = { id: string; customerId: string; assigneeId: string | null };

const SUMMARIES: Record<(typeof ASSIGN_REASONS)[number], [assigned: string, unassigned: string]> = {
  member: ['Assigned the conversation', 'Unassigned the conversation'],
  automation: [
    'An automation assigned the conversation',
    'An automation unassigned the conversation',
  ],
  auto: ['Assigned the conversation to an available member', 'Unassigned the conversation'],
  unanswered: [
    'Reassigned the conversation: the assignee had not replied',
    'Unassigned the conversation: the assignee had not replied',
  ],
  call: ['Assigned the conversation to who answered the call', 'Unassigned the conversation'],
};

/**
 * Assigns the conversations to `assigneeId`, who takes them from the bot, or unassigns them with
 * null; the ones already with them stay as they are. Stamps when, so the channel's
 * `reassignAfterMinutes` counts from it, and records each change on the timeline with `reason`.
 * With `notify`, core tells the new assignee; a member's change tells them after it commits
 * instead (`conversations.assign`). Returns the conversations that changed.
 */
export const assignConversations = async (
  tx: Tx,
  orgId: string,
  actorId: string | null,
  rows: Row[],
  assigneeId: string | null,
  {
    reason,
    notify = false,
    payload = {},
  }: {
    reason: (typeof ASSIGN_REASONS)[number];
    notify?: boolean;
    payload?: Record<string, unknown>;
  },
) => {
  const changed = rows.filter((row) => row.assigneeId !== assigneeId);
  const ids = changed.map((row) => row.id);

  if (ids.length === 0) return changed;

  await tx
    .update(conversations)
    .set({ assigneeId, assignedAt: assigneeId ? sql`now()` : null })
    .where(inArray(conversations.id, ids));

  if (assigneeId) await takeOver(tx, ids);

  const [assigned, unassigned] = SUMMARIES[reason];

  await publishConversationEvents(
    tx,
    orgId,
    actorId,
    changed.map((row) => ({
      conversationId: row.id,
      customerId: row.customerId,
      type: CONVERSATION_EVENTS.assigned.type,
      summary: assigneeId ? assigned : unassigned,
      payload: { from: row.assigneeId, to: assigneeId, reason, ...payload },
      ...(notify &&
        assigneeId && {
          notify: { userIds: [assigneeId], title: 'A conversation was assigned to you' },
        }),
    })),
  );
  // The visitor's messenger hears too: the bot no longer answers an assigned conversation.
  await signalConversations(tx, orgId, changed);

  return changed;
};
