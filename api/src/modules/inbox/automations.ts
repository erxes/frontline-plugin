import { bearerOf, type CoreCall, verifyCoreCall } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { config, PLUGIN } from '#/config.ts';
import { CONVERSATION_EVENTS, core, INBOX_ACTIONS, INBOX_NOTIFICATIONS } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { conversations } from '#/db/inbox.ts';
import { logger } from '#/logger.ts';
import { fail } from '../fail.ts';
import { addBotMessage, setOperatorOf } from './operator.ts';
import { publishConversationEvents, signalConversations } from './shared.ts';

/** What core POSTs: the step's input, and the event that started the run. */
const Body = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
  context: z
    .object({
      event: z
        .object({
          entityId: z.string().nullish(),
          payload: z.record(z.string(), z.unknown()).default({}),
        })
        .nullish(),
    })
    .default({}),
});

type Body = z.infer<typeof Body>;

/** The step's conversation: its own input, else the event's (a message's payload or a record). */
const conversationIdOf = ({ input, context }: Body) =>
  z
    .string()
    .min(1)
    .parse(
      input.conversationId ?? context.event?.payload.conversationId ?? context.event?.entityId,
    );

const conversationOf = async (tx: Tx, id: string) => {
  const [row] = await tx
    .select({
      id: conversations.id,
      customerId: conversations.customerId,
      operator: conversations.operator,
    })
    .from(conversations)
    .where(eq(conversations.id, id))
    .for('update');

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such conversation' });

  return row;
};

/**
 * The bot answers the customer, unless a person has the conversation. The step's idempotency key
 * is the message's provider id, so a retried step sends nothing twice.
 */
const reply = (call: CoreCall, body: Body, key: string) =>
  withOrg(call.orgId, async (tx) => {
    const content = z.string().trim().min(1).max(10_000).parse(body.input.content);
    const conversation = await conversationOf(tx, conversationIdOf(body));

    if (conversation.operator === 'person') return { sent: false };

    await addBotMessage(tx, call.orgId, conversation, content, `automation:${key}`);
    await signalConversations(tx, call.orgId, [conversation]);

    return { sent: true };
  });

/** Stops automated replies and tells the customer; assigns the first member the step names. */
const handOff = async (call: CoreCall, body: Body) => {
  const [assigneeId] = z.array(z.string()).default([]).parse(body.input.assigneeIds);

  const conversation = await withOrg(call.orgId, async (tx) => {
    const row = await conversationOf(tx, conversationIdOf(body));

    await setOperatorOf(tx, call.orgId, [row], 'person');

    if (assigneeId) {
      await tx.update(conversations).set({ assigneeId }).where(eq(conversations.id, row.id));
      await publishConversationEvents(tx, call.orgId, null, [
        {
          conversationId: row.id,
          customerId: row.customerId,
          type: CONVERSATION_EVENTS.assigned.type,
          summary: 'An automation assigned the conversation',
          payload: { assigneeId, automationId: call.automationId },
        },
      ]);
      await signalConversations(tx, call.orgId, []);
    }

    return row;
  });

  if (assigneeId)
    await core
      .forOrg(call.orgId)
      .notifications.create({
        kind: INBOX_NOTIFICATIONS.assigned,
        title: 'A conversation was assigned to you',
        link: `/${PLUGIN}/inbox?conversationId=${encodeURIComponent(conversation.id)}`,
        userIds: [assigneeId],
        dedupeKey: `assigned:${assigneeId}:${conversation.id}:${call.runId}`,
      })
      .catch((error: unknown) => {
        logger.error(
          { err: error, assigneeId, conversationId: conversation.id },
          'hand-off notification failed',
        );
      });

  return { operator: 'person', assigneeId: assigneeId ?? null };
};

/**
 * `POST /api/automations/actions/:type`: core runs one of the inbox's actions for an automation.
 * The JSON answer is the step's output; anything but 2xx fails the step.
 */
export const runAction = async (req: Request, res: Response) => {
  const call = await verifyCoreCall(bearerOf(req.headers.authorization) ?? '', {
    coreUrl: config.coreUrl,
    plugin: PLUGIN,
  }).catch(() => null);

  if (!call) {
    res.status(401).json({ message: 'Not a call from core' });

    return;
  }

  try {
    const body = Body.parse(req.body);

    const key = z
      .string()
      .default(`${call.runId}:${call.stepId}`)
      .parse(req.headers['idempotency-key']);

    if (req.params.type === INBOX_ACTIONS.reply) {
      res.json(await reply(call, body, key));

      return;
    }

    if (req.params.type === INBOX_ACTIONS.handOff) {
      res.json(await handOff(call, body));

      return;
    }

    res.status(404).json({ message: `No ${String(req.params.type)} action` });
  } catch (error) {
    fail(res, error, 'automation action');
  }
};
