import { AgentBlock, AgentFailed, AgentFinished, AgentHandedOff } from '@erxes/core-contract';
import type { DeliveredEvent } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { AGENT_EVENTS, core, PERMISSIONS } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { conversations, integrations, messages } from '#/db/inbox.ts';
import { logger } from '#/logger.ts';
import { writes } from '#/orpc.ts';
import { integrationFor } from './integrations.ts';
import { addBotMessage, setOperatorOf, takeOver } from './operator.ts';
import { signalConversations } from './shared.ts';

/** The kinds of integration a core agent answers: the website messenger and Meta's direct messages. */
const AGENT_KINDS = new Set(['messenger', 'facebook', 'instagram']);

/**
 * The conversation `key` names, locked, while its integration's agent is `agentId` and the bot
 * still answers it; null once a person took it or the integration's agent changed.
 */
const answeredBy = async (tx: Tx, { agentId, key }: { agentId: string; key: string }) => {
  const [row] = await tx
    .select({
      id: conversations.id,
      customerId: conversations.customerId,
      operator: conversations.operator,
    })
    .from(conversations)
    .innerJoin(integrations, eq(integrations.id, conversations.integrationId))
    .where(
      and(
        eq(conversations.id, key),
        eq(conversations.operator, 'bot'),
        eq(integrations.agentId, agentId),
      ),
    )
    .for('update', { of: conversations });

  return row ?? null;
};

/** The agent of the conversation's integration, while the bot still answers the conversation. */
const agentOf = (orgId: string, conversationId: string) =>
  withOrg(orgId, async (tx) => {
    const [row] = await tx
      .select({ agentId: integrations.agentId })
      .from(conversations)
      .innerJoin(integrations, eq(integrations.id, conversations.integrationId))
      .where(and(eq(conversations.id, conversationId), eq(conversations.operator, 'bot')));

    return row?.agentId ?? null;
  });

/** The agent will not answer: a person takes the conversation, and the customer hears so. */
const handOff = (orgId: string, { agentId, key }: { agentId: string; key: string }) =>
  withOrg(orgId, async (tx) => {
    const conversation = await answeredBy(tx, { agentId, key });

    if (conversation) await setOperatorOf(tx, orgId, [conversation], 'person');
  });

/**
 * Gives a customer's message to the core agent of its conversation's integration, after the
 * message committed. The conversation id is core's key for it and the message id makes a retry
 * land once. `customerId` goes when the sender is known for sure, such as a visitor the website
 * signed in or a Meta account, so the agent acts for them. The answer comes back as
 * `core.agent.finished`; when core refuses the message, a person takes the conversation.
 */
export const submitToAgent = async (
  orgId: string,
  message: { id: string; conversationId: string; content: string },
  customerId: string | null,
) => {
  if (!message.content) return;

  const agentId = await agentOf(orgId, message.conversationId);

  if (!agentId) return;

  await core
    .forOrg(orgId)
    .agents.submit({
      id: agentId,
      key: message.conversationId,
      text: message.content,
      requestId: message.id,
      ...(customerId && { customerId }),
    })
    .catch((error: unknown) => {
      logger.error(
        {
          err: error,
          orgId,
          agentId,
          conversationId: message.conversationId,
          messageId: message.id,
        },
        'core agent did not take the message; a person takes the conversation',
      );

      return handOff(orgId, { agentId, key: message.conversationId });
    });
};

/**
 * `core.agent.finished` as this build reads it. A block whose kind is newer than this build's
 * contract is left out, so the answer and the other blocks still post.
 */
const Finished = AgentFinished.extend({
  blocks: z.array(z.unknown()).transform((blocks) =>
    blocks.flatMap((block) => {
      const parsed = AgentBlock.safeParse(block);

      return parsed.success ? [parsed.data] : [];
    }),
  ),
});

/**
 * Posts the agent's answer, with the blocks it showed below it, into its conversation as the bot,
 * and tells the inbox and the customer: the messenger's visitor reads it, and an integration
 * that sends replies queues it for its adapter. The message takes the event's id, so a repeated
 * delivery of the event adds nothing even after the send gave the message the provider's id.
 * Nor does an answer to a conversation a person took meanwhile. Returns whether it posted.
 */
const postAnswer = (orgId: string, eventId: string, finished: z.output<typeof Finished>) =>
  withOrg(orgId, async (tx) => {
    const conversation = await answeredBy(tx, finished);

    if (!conversation || (!finished.answer.trim() && finished.blocks.length === 0)) return false;

    const posted = await addBotMessage(tx, orgId, conversation, finished.answer, {
      id: eventId,
      blocks: finished.blocks,
    });

    if (posted) await signalConversations(tx, orgId, [conversation]);

    return posted;
  });

/**
 * The agent gave the conversation to a person: a person takes it, and the team reads why in an
 * internal note. The customer already read the agent's own line in its answer, so no hand-off
 * message goes out. The note takes the event's id and the change needs the bot to still have the
 * conversation, so a repeated delivery adds nothing. Returns whether it handed the conversation off.
 */
const handedOff = (orgId: string, eventId: string, event: z.output<typeof AgentHandedOff>) =>
  withOrg(orgId, async (tx) => {
    const conversation = await answeredBy(tx, event);

    if (!conversation) return false;

    await takeOver(tx, [conversation.id]);
    await tx
      .insert(messages)
      .values({
        id: eventId,
        orgId,
        conversationId: conversation.id,
        content: `The agent handed this conversation to a person: ${event.reason}`,
        internal: true,
      })
      .onConflictDoNothing();
    await signalConversations(tx, orgId, [conversation]);

    return true;
  });

/** Acts on what core says of a message the plugin gave an agent; other events pass by. */
export const onAgentEvent = async ({ id, type, organizationId, data }: DeliveredEvent) => {
  if (type === AGENT_EVENTS.handedOff) {
    const event = AgentHandedOff.parse(data.payload);
    const handed = await handedOff(organizationId, id, event);

    logger.info(
      { eventId: id, orgId: organizationId, conversationId: event.key, handed },
      'core agent handed the conversation to a person',
    );
  }

  if (type === AGENT_EVENTS.finished) {
    const finished = Finished.parse(data.payload);
    const posted = await postAnswer(organizationId, id, finished);

    logger.info(
      { eventId: id, orgId: organizationId, conversationId: finished.key, posted },
      'core agent answered',
    );
  }

  if (type === AGENT_EVENTS.failed) {
    const failed = AgentFailed.parse(data.payload);

    logger.warn(
      {
        orgId: organizationId,
        agentId: failed.agentId,
        conversationId: failed.key,
        reason: failed.reason,
      },
      'core agent gave no answer; a person takes the conversation',
    );

    await handOff(organizationId, failed);
  }
};

/**
 * The core agent that answers the integration's conversations while the bot has them, or none
 * with null, for a member who may change it. Core refuses messages to an agent it doesn't have.
 */
const setAgent = writes(PERMISSIONS.channelView)
  .input(z.object({ id: z.string(), agentId: z.string().min(1).nullable() }))
  .output(z.object({ id: z.string(), agentId: z.string().nullable() }))
  .handler(async ({ input, context: { tx, member } }) => {
    const row = await integrationFor(tx, member, input.id);

    if (!AGENT_KINDS.has(row.kind))
      throw new ORPCError('BAD_REQUEST', {
        message: 'An agent answers website messenger, Facebook and Instagram conversations only',
      });

    await tx
      .update(integrations)
      .set({ agentId: input.agentId })
      .where(eq(integrations.id, input.id));

    return input;
  });

export const integrationAgentProcedures = { setAgent };
