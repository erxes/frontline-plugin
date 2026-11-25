import { bearerOf, type CoreCall, verifyCoreCall } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { signedByCore } from '#/config.ts';
import { FORM_ACTIONS, INBOX_ACTIONS, INBOX_NOTIFICATIONS, TICKET_ACTIONS } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { conversations } from '#/db/inbox.ts';
import { fail, verifiedBy } from '../fail.ts';
import { createFormLink } from '../forms/links.ts';
import { sendKindOf, sendMessage } from '../integrations/actions.ts';
import { createTicket } from '../tickets/automation.ts';
import { assignConversations } from './assign.ts';
import { addBotMessage, handToPerson, setOperatorOf } from './operator.ts';
import { notifyMembers } from '../notify.ts';
import { conversationLink, signalConversations } from './shared.ts';

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
      assigneeId: conversations.assigneeId,
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

    await addBotMessage(tx, call.orgId, conversation, content, {
      externalId: `automation:${key}`,
    });
    await signalConversations(tx, call.orgId, [conversation]);

    return { sent: true };
  });

/**
 * Stops automated replies and tells the customer; assigns the first member the step names, else
 * the channel's auto-assignment picks one.
 */
const handOff = async (call: CoreCall, body: Body) => {
  const [assigneeId] = z.array(z.string()).default([]).parse(body.input.assigneeIds);

  const conversation = await withOrg(call.orgId, async (tx) => {
    const row = await conversationOf(tx, conversationIdOf(body));

    if (assigneeId) {
      await setOperatorOf(tx, call.orgId, [row], 'person');
      await assignConversations(tx, call.orgId, null, [row], assigneeId, {
        reason: 'automation',
        payload: { automationId: call.automationId },
      });
    } else await handToPerson(tx, call.orgId, [row]);

    return row;
  });

  if (assigneeId)
    await notifyMembers(call.orgId, {
      kind: INBOX_NOTIFICATIONS.assigned,
      title: 'A conversation was assigned to you',
      link: conversationLink(conversation.id),
      userIds: [assigneeId],
      dedupeKey: `assigned:${assigneeId}:${conversation.id}:${call.runId}`,
    });

  return { operator: 'person', assigneeId: assigneeId ?? null };
};

/**
 * `POST /api/automations/actions/:type`: core runs one of the plugin's actions for an automation,
 * an inbox action, a form link or a provider's send step.
 * The JSON answer is the step's output; anything but 2xx fails the step.
 */
export const runAction = async (req: Request, res: Response) => {
  const call = await verifiedBy(res, 'automation call token', 'Not a call from core', () =>
    verifyCoreCall(bearerOf(req.headers.authorization) ?? '', signedByCore),
  );

  if (!call) return;

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

    if (req.params.type === TICKET_ACTIONS.create) {
      res.json(await createTicket(call, req.body, key));

      return;
    }

    if (req.params.type === FORM_ACTIONS.createLink) {
      res.json(await createFormLink(call, req.body, key));

      return;
    }

    const kind = sendKindOf(String(req.params.type));

    if (kind) {
      res.json(await sendMessage(call, kind, req.body, key));

      return;
    }

    res.status(404).json({ message: `No ${String(req.params.type)} action` });
  } catch (error) {
    fail(res, error, 'automation action');
  }
};
