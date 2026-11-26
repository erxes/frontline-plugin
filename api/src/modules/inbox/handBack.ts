import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { CONVERSATION_OPERATORS, conversations, integrations, messages } from '#/db/inbox.ts';
import { writes } from '#/orpc.ts';
import { submitToAgent } from './agent.ts';
import { setOperatorOf } from './operator.ts';
import { conversationsFor, Ids } from './shared.ts';

/** How many of the customer's latest messages, at most, an agent gets when it answers again. */
const WAITING_MAX = 20;

/**
 * What the customer wrote since the team or the bot last answered, oldest first, as one text,
 * and the id of the last of it; null when nothing waits.
 */
const waitingOf = async (tx: Tx, conversationId: string) => {
  const latest = await tx
    .select({ id: messages.id, content: messages.content, customerId: messages.customerId })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.internal, false)))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(WAITING_MAX);

  const answered = latest.findIndex((message) => message.customerId === null);
  const waiting = (answered === -1 ? latest : latest.slice(0, answered)).toReversed();

  const text = waiting
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n');

  const last = waiting.at(-1);

  return last && text ? { lastId: last.id, text } : null;
};

/**
 * The conversations among `ids` that an agent answers again and whose customer waits, each with
 * what the customer wrote meanwhile, for the agent to answer once the change commits.
 */
const waitingForAgent = async (tx: Tx, ids: string[]) => {
  if (!ids.length) return [];

  const rows = await tx
    .select({ id: conversations.id, customerId: conversations.customerId, kind: integrations.kind })
    .from(conversations)
    .innerJoin(integrations, eq(integrations.id, conversations.integrationId))
    .where(
      and(
        inArray(conversations.id, ids),
        isNotNull(integrations.agentId),
        eq(conversations.customerRespondedLast, true),
      ),
    );

  const found = await Promise.all(
    rows.map(async (row) => ({ ...row, waiting: await waitingOf(tx, row.id) })),
  );

  return found.flatMap(({ waiting, ...row }) => (waiting ? [{ ...row, ...waiting }] : []));
};

type Answering = Awaited<ReturnType<typeof waitingForAgent>>[number];

/** Gives the agent what each customer wrote meanwhile; core answers as `core.agent.finished`. */
const answerWaiting = (orgId: string, waiting: Answering[]) =>
  Promise.all(
    waiting.map((row) =>
      submitToAgent(
        orgId,
        // Its own request id, so an agent that handed this message off answers it again.
        { id: `resume:${row.lastId}`, conversationId: row.id, content: row.text },
        // A provider's customer is known for sure; a messenger visitor may not be signed in.
        row.kind === 'messenger' ? null : row.customerId,
      ),
    ),
  );

/**
 * Gives the conversations back to the bot. Resolves to a call, for after the change commits,
 * that has the agent answer each one whose customer wrote since anyone last answered, so the
 * customer isn't left waiting for their next message.
 */
export const handBack = async (
  tx: Tx,
  orgId: string,
  rows: { id: string; customerId: string; operator: string }[],
) => {
  const handedBack = rows.filter((row) => row.operator === 'person').map((row) => row.id);

  await setOperatorOf(tx, orgId, rows, 'bot');

  const waiting = await waitingForAgent(tx, handedBack);

  return () => answerWaiting(orgId, waiting).then(() => undefined);
};

/**
 * A member hands conversations to a person, or lets the bot answer them again; an agent answers
 * at once what a waiting customer wrote meanwhile.
 */
const setOperator = writes(PERMISSIONS.inboxView)
  .route({ summary: 'Hand conversations to a person, or let the bot answer them again' })
  .input(z.object({ ids: Ids, operator: z.enum(CONVERSATION_OPERATORS) }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx, member, afterCommit } }) => {
    const rows = await conversationsFor(tx, member, input.ids);

    if (input.operator === 'bot') afterCommit(await handBack(tx, member.orgId, rows));
    else await setOperatorOf(tx, member.orgId, rows, 'person');

    return { ids: input.ids };
  });

export const handBackProcedures = { setOperator };
