import type { AgentBlock } from '@erxes/core-contract';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { CONVERSATION_OPERATORS, conversations, integrations, messages } from '#/db/inbox.ts';
import { writes } from '#/orpc.ts';
import { ADAPTERS } from './adapters.ts';
import { queueSend } from './post.ts';
import { inOrder } from '../integrations/provider.ts';
import { conversationsFor, Ids, signalConversations } from './shared.ts';

/** What the customer reads when a person takes the conversation over from the bot. */
export const HAND_OFF_MESSAGE = 'A person from the team will answer you here.';

type Target = { id: string; customerId: string };

/**
 * Adds a message from neither the customer nor a member (the bot) to a conversation and sends
 * it like a reply: queued for the adapter's `send`, or delivered on commit. An `id` or
 * `externalId` the caller derives from what it answers makes a retry add nothing. A message that `answers` the customer stops their wait; a
 * hand-off doesn't, as they still wait for the person. A core agent's answer carries the `blocks`
 * it showed below it. Returns false when it is already there.
 */
export const addBotMessage = async (
  tx: Tx,
  orgId: string,
  conversation: Target,
  content: string,
  {
    id,
    externalId,
    answers = true,
    blocks = [],
  }: { id?: string; externalId?: string; answers?: boolean; blocks?: AgentBlock[] } = {},
) => {
  const [integration] = await tx
    .select({ kind: integrations.kind })
    .from(conversations)
    .innerJoin(integrations, eq(integrations.id, conversations.integrationId))
    .where(eq(conversations.id, conversation.id));

  const queued = Boolean(ADAPTERS.get(integration?.kind ?? '')?.send);

  const [message] = await tx
    .insert(messages)
    .values({
      id,
      orgId,
      conversationId: conversation.id,
      content,
      blocks,
      externalId,
      deliveryStatus: queued ? 'queued' : 'sent',
    })
    .onConflictDoNothing()
    .returning({ id: messages.id, createdAt: messages.createdAt });

  if (!message) return false;

  await tx
    .update(conversations)
    .set({
      content,
      messageCount: sql`${conversations.messageCount} + 1`,
      lastMessageAt: message.createdAt,
      ...(answers && { customerRespondedLast: false }),
    })
    .where(eq(conversations.id, conversation.id));

  if (queued) await queueSend(tx, orgId, message.id, message.id);

  return true;
};

/**
 * Hands the conversations to a person, so automations stop answering them, or back to the bot.
 * A handover tells the customer. Conversations already with that operator are left alone.
 */
export const setOperatorOf = async (
  tx: Tx,
  orgId: string,
  rows: (Target & { operator: string })[],
  operator: (typeof CONVERSATION_OPERATORS)[number],
) => {
  const changed = rows.filter((row) => row.operator !== operator);

  if (changed.length === 0) return;

  await tx
    .update(conversations)
    .set({ operator })
    .where(
      inArray(
        conversations.id,
        changed.map((row) => row.id),
      ),
    );

  if (operator === 'person')
    await inOrder(changed, (row) =>
      addBotMessage(tx, orgId, row, HAND_OFF_MESSAGE, { answers: false }),
    );

  await signalConversations(tx, orgId, changed);
};

/**
 * A member replied in the conversations or was assigned them, so the bot stops answering. The
 * reply or the assignee speaks for itself: the customer gets no hand-off message.
 */
export const takeOver = (tx: Tx, ids: string[]) =>
  tx
    .update(conversations)
    .set({ operator: 'person' })
    .where(and(inArray(conversations.id, ids), eq(conversations.operator, 'bot')));

/** A member hands conversations to a person, or lets the bot answer them again. */
const setOperator = writes(PERMISSIONS.inboxView)
  .input(z.object({ ids: Ids, operator: z.enum(CONVERSATION_OPERATORS) }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx, member } }) => {
    const rows = await conversationsFor(tx, member, input.ids);

    await setOperatorOf(tx, member.orgId, rows, input.operator);

    return { ids: input.ids };
  });

export const operatorProcedures = { setOperator };
