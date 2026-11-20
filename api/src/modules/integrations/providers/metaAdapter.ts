import { randomUUID } from 'node:crypto';
import type { MetaKind } from '@erxes/core-contract';
import { ORPCError } from '@orpc/server';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { fileIdOf } from '#/coreFile.ts';
import type { Tx } from '#/db/client.ts';
import { messages } from '#/db/inbox.ts';
import type { StoredFile } from '#/db/table.ts';
import type { Adapter, Outgoing } from '../../inbox/adapters.ts';
import { quotedIdOf } from '../quoted.ts';
import { authorOfThread, MetaConfig, metaOf, postOfThread } from './meta.ts';

const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

const LOVE = '❤';

const unvaried = (value: string) => value.replaceAll('️', '');

const threadOf = ({
  integration,
  conversation,
}: Pick<Outgoing, 'integration' | 'conversation'>) => {
  const { connectionId } = MetaConfig.parse(integration.config);

  if (!conversation.externalId)
    throw new ORPCError('BAD_REQUEST', {
      message: 'The conversation has no thread at the provider',
    });

  return { connectionId, threadId: conversation.externalId };
};

const customerLatest = async (tx: Tx, conversationId: string) => {
  const [last] = await tx
    .select({ externalId: messages.externalId, createdAt: messages.createdAt })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNotNull(messages.customerId),
        isNotNull(messages.externalId),
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(1);

  return last;
};

const coreFileIds = (attachments: StoredFile[]) =>
  attachments.map((file) => {
    const id = fileIdOf(file.url);

    if (!id) throw new Error(`No file in core's storage at ${file.url}`);

    return id;
  });

const refusedByMeta = (error: unknown) =>
  error instanceof ORPCError && error.code === 'META_REFUSED';

const replyToComment = async (
  kind: MetaKind,
  outgoing: Outgoing,
  { connectionId, threadId }: ReturnType<typeof threadOf>,
  { picked, latest }: { picked: string; latest: string },
) => {
  const { message, orgId } = outgoing;
  const [fileId, ...more] = coreFileIds(message.attachments);

  if (more.length) throw new Error('A comment reply takes one file');

  const text =
    kind === 'facebook' ? `@[${authorOfThread(threadId)}] ${message.content}` : message.content;

  const reply = (commentId: string, idempotencyKey: string) =>
    metaOf(orgId).send({
      kind: 'comment_reply',
      connectionId,
      idempotencyKey,
      commentId,
      text,
      fileId,
    });

  try {
    return await reply(picked, `frontline:${message.id}`);
  } catch (error) {
    if (!refusedByMeta(error) || picked === latest) throw error;

    return reply(latest, `frontline:${message.id}:latest`);
  }
};

export const metaAdapter = (kind: MetaKind, label: string): Adapter => ({
  kind,
  label,
  config: MetaConfig,
  send: async (tx, outgoing) => {
    const thread = threadOf(outgoing);
    const { message, orgId } = outgoing;
    const quotedId = await quotedIdOf(tx, message.id);
    const latest = await customerLatest(tx, outgoing.conversation.id);

    if (postOfThread(thread.threadId)) {
      const picked = quotedId ?? latest?.externalId;

      if (!picked || !latest?.externalId) throw new Error('No comment to answer');

      const comment = { picked, latest: latest.externalId };

      return async () => ({
        externalId: (await replyToComment(kind, outgoing, thread, comment)).id,
      });
    }

    const humanAgent =
      latest !== undefined && Date.now() - latest.createdAt.getTime() > REPLY_WINDOW_MS;

    const fileIds = coreFileIds(message.attachments);

    return async () => {
      const sent = await metaOf(orgId).send({
        kind: 'message',
        connectionId: thread.connectionId,
        idempotencyKey: `frontline:${message.id}`,
        recipientId: thread.threadId,
        text: message.content || undefined,
        fileIds,
        replyToMessageId: quotedId ?? undefined,
        humanAgent,
      });

      return { externalId: sent.id };
    };
  },
  react: async (_tx, { emoji, emojis, orgId, ...outgoing }) => {
    const { connectionId, threadId } = threadOf(outgoing);
    const { externalId } = outgoing.message;

    if (postOfThread(threadId) || unvaried(emoji) !== LOVE || !externalId)
      throw new ORPCError('BAD_REQUEST', { message: 'Meta takes only ❤️ on a message' });

    const on = emojis.some((one) => unvaried(one) === LOVE);

    return async () => {
      await metaOf(orgId).send({
        kind: 'reaction',
        connectionId,
        idempotencyKey: `frontline:${randomUUID()}`,
        recipientId: threadId,
        messageId: externalId,
        on,
      });
    };
  },
});
