import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { integrations } from '#/db/inbox.ts';
import { surveys } from '#/db/surveys.ts';
import { reads, writes } from '#/orpc.ts';
import { ADAPTERS } from '../inbox/adapters.ts';
import { Message } from '../inbox/messages.ts';
import { postMessage } from '../inbox/post.ts';
import { conversationById } from '../inbox/shared.ts';
import { surveysFor } from './shared.ts';

/** The conversation, and whether its customer can vote, as the messenger's visitors can. */
const votingConversation = async (tx: Tx, member: PluginMember, conversationId: string) => {
  const conversation = await conversationById(tx, member, conversationId);

  const [integration] = await tx
    .select({ kind: integrations.kind })
    .from(integrations)
    .where(eq(integrations.id, conversation.integrationId));

  return { conversation, votes: ADAPTERS.get(integration?.kind ?? '')?.surveys ?? false };
};

/**
 * The surveys the member may send into the conversation: its channel's active ones, oldest first.
 * None without the permission, or where the customer can't vote.
 */
const sendable = reads(PERMISSIONS.inboxView)
  .input(z.object({ conversationId: z.string() }))
  .output(z.array(z.object({ id: z.string(), title: z.string() })))
  .handler(async ({ input, context: { tx, member } }) => {
    const { conversation, votes } = await votingConversation(tx, member, input.conversationId);

    if (!votes || !member.can(PERMISSIONS.surveySend)) return [];

    return tx
      .select({ id: surveys.id, title: surveys.title })
      .from(surveys)
      .where(and(eq(surveys.channelId, conversation.channelId), eq(surveys.status, 'active')))
      .orderBy(asc(surveys.createdAt), asc(surveys.id));
  });

/**
 * Posts an active survey of the conversation's channel into it, as a message whose customer
 * votes on it. Only integrations whose customers can vote take one, such as the messenger.
 */
const send = writes(PERMISSIONS.surveySend)
  .input(z.object({ id: z.string(), conversationId: z.string() }))
  .output(Message)
  .handler(async ({ input, context: { tx, member } }) => {
    const { conversation, votes } = await votingConversation(tx, member, input.conversationId);
    const [survey] = await surveysFor(tx, member, [input.id], false);

    if (!survey) throw new ORPCError('NOT_FOUND', { message: 'No such survey' });

    if (survey.status !== 'active')
      throw new ORPCError('BAD_REQUEST', { message: 'Only an active survey can be sent' });

    if (survey.channelId !== conversation.channelId)
      throw new ORPCError('BAD_REQUEST', { message: 'This survey belongs to another channel' });

    if (!votes)
      throw new ORPCError('BAD_REQUEST', {
        message: "This conversation's customer can't vote on a survey",
      });

    const message = await postMessage(tx, member, conversation, {
      content: survey.steps[0]?.question ?? survey.title,
      attachments: [],
      internal: false,
      mentionedUserIds: [],
      replyToId: null,
      surveyId: survey.id,
    });

    await tx
      .update(surveys)
      .set({ sentCount: sql`${surveys.sentCount} + 1` })
      .where(eq(surveys.id, survey.id));

    return message;
  });

export const surveySendProcedures = { sendable, send };
