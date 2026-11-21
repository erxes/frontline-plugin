import { AgentBlock, AgentFailed, AgentFinished } from '@erxes/core-contract';
import type { DeliveredEvent } from '@erxes/plugin-sdk';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { AGENT_EVENTS, core } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { conversations, integrations } from '#/db/inbox.ts';
import { logger } from '#/logger.ts';
import { addBotMessage, setOperatorOf } from '../inbox/operator.ts';
import { signalConversations } from '../inbox/shared.ts';
import type { Visitor } from './session.ts';

/**
 * The conversation `key` names, locked, while its messenger's agent is `agentId` and the bot still
 * answers it; null once a person took it or the messenger's agent changed.
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

/** The agent of the conversation's messenger, while the bot still answers the conversation. */
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
 * Gives a visitor's message to the messenger's core agent, after the message committed. The
 * conversation id is core's key for it and the message id makes a retry land once. Only a visitor
 * the website signed in goes as the customer, so the agent acts for them. The answer comes back as
 * `core.agent.finished`; when core refuses the message, a person takes the conversation.
 */
export const submitToAgent = async (
  visitor: Visitor,
  message: { id: string; conversationId: string; content: string },
) => {
  if (!message.content) return;

  const agentId = await agentOf(visitor.orgId, message.conversationId);

  if (!agentId) return;

  await core
    .forOrg(visitor.orgId)
    .agents.submit({
      id: agentId,
      key: message.conversationId,
      text: message.content,
      requestId: message.id,
      ...(visitor.verified && { customerId: visitor.customerId }),
    })
    .catch((error: unknown) => {
      logger.error(
        {
          err: error,
          orgId: visitor.orgId,
          agentId,
          conversationId: message.conversationId,
          messageId: message.id,
        },
        'core agent did not take the message; a person takes the conversation',
      );

      return handOff(visitor.orgId, { agentId, key: message.conversationId });
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
 * and tells the inbox and the visitor's messenger. A repeated delivery of `eventId` adds nothing,
 * and so does an answer to a conversation a person took meanwhile. Returns whether it posted.
 */
const postAnswer = (orgId: string, eventId: string, finished: z.output<typeof Finished>) =>
  withOrg(orgId, async (tx) => {
    const conversation = await answeredBy(tx, finished);

    if (!conversation || (!finished.answer.trim() && finished.blocks.length === 0)) return false;

    const posted = await addBotMessage(tx, orgId, conversation, finished.answer, {
      externalId: `agent:${eventId}`,
      blocks: finished.blocks,
    });

    if (posted) await signalConversations(tx, orgId, [conversation]);

    return posted;
  });

/** Acts on what core says of a message the plugin gave an agent; other events pass by. */
export const onAgentEvent = async ({ id, type, organizationId, data }: DeliveredEvent) => {
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
