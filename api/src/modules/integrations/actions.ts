import { createHash } from 'node:crypto';
import type { CoreCall } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { CONVERSATION_TIMELINE, SEND_ACTIONS } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { conversations, integrations } from '#/db/inbox.ts';
import { logger } from '#/logger.ts';
import { postMessage } from '../inbox/post.ts';

/** What core POSTs for a step: its filled-in fields and the run's trigger event and subject. */
const Call = z.object({
  input: z.object({ message: z.string().trim().min(1).max(10_000) }),
  context: z.object({
    event: z
      .object({
        subjectType: z.string().nullish(),
        subjectId: z.string().nullish(),
        entityType: z.string().nullish(),
        entityId: z.string().nullish(),
      })
      .nullish(),
    subject: z.object({ id: z.string() }).nullish(),
  }),
});

const KINDS = new Map<string, string>(
  Object.entries(SEND_ACTIONS).map(([kind, action]) => [action.type, kind]),
);

/**
 * The conversation of `kind` the step answers: the one its trigger event is about, else the run's
 * customer's latest.
 */
const conversationOf = async (tx: Tx, kind: string, context: z.infer<typeof Call>['context']) => {
  const event = context.event;
  const conversationId = event?.entityType === CONVERSATION_TIMELINE ? event.entityId : null;

  const customerId =
    context.subject?.id ?? (event?.subjectType === 'customer' ? event.subjectId : null);

  const match = conversationId
    ? eq(conversations.id, conversationId)
    : customerId
      ? eq(conversations.customerId, customerId)
      : undefined;

  if (!match) return undefined;

  const [found] = await tx
    .select({
      id: conversations.id,
      customerId: conversations.customerId,
      integrationId: conversations.integrationId,
    })
    .from(conversations)
    .innerJoin(integrations, eq(integrations.id, conversations.integrationId))
    .where(and(match, eq(integrations.kind, kind)))
    .orderBy(desc(conversations.lastMessageAt), desc(conversations.id))
    .limit(1);

  return found;
};

/** The provider a send step's `type` replies through, or undefined for another action. */
export const sendKindOf = (type: string) => KINDS.get(type);

/**
 * Runs a send step (`SEND_ACTIONS`): a reply from the member the automation runs as, sent
 * through the conversation's adapter like any reply. Core retries a step with the same
 * idempotency `key`, which names the message, so a retry adds nothing.
 */
export const sendMessage = async (call: CoreCall, kind: string, body: unknown, key: string) => {
  const { input, context } = Call.parse(body);

  const sent = await withOrg(call.orgId, async (tx) => {
    const conversation = await conversationOf(tx, kind, context);

    if (!conversation) return null;

    const message = await postMessage(tx, call, conversation, {
      id: createHash('sha256').update(`${call.orgId}:${key}`).digest('base64url'),
      content: input.message,
      attachments: [],
      internal: false,
      mentionedUserIds: [],
      replyToId: null,
    });

    return { messageId: message.id, conversationId: conversation.id, content: message.content };
  });

  if (!sent) {
    logger.info({ kind, runId: call.runId }, 'no conversation to reply in');
    throw new ORPCError('UNPROCESSABLE_CONTENT', {
      message: `The customer has no ${kind} conversation to reply in`,
    });
  }

  return sent;
};
