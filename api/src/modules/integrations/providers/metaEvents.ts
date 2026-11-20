import { META_EVENTS, type MetaKind } from '@erxes/core-contract';
import type { DeliveredEvent } from '@erxes/plugin-sdk';
import { and, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { refusedData, type Tx, withOrg } from '#/db/client.ts';
import { conversations, integrations, messageReactions, messages } from '#/db/inbox.ts';
import type { StoredFile } from '#/db/table.ts';
import { logger } from '#/logger.ts';
import { receiveIn } from '../../inbox/receive.ts';
import { signalConversations, signalMembers } from '../../inbox/shared.ts';
import { copiesOf } from './metaFiles.ts';

const Thread = { connectionId: z.string(), threadId: z.string() };

const Files = z
  .array(z.object({ url: z.string(), name: z.string().nullish(), type: z.string().nullish() }))
  .default([])
  .transform((files) =>
    files.map(({ url, name, type }): StoredFile => ({
      url,
      name: name ?? type ?? 'file',
      ...(type ? { type } : {}),
    })),
  );

const Received = z.object({
  ...Thread,
  messageId: z.string(),
  text: z.string().default(''),
  replyToMessageId: z.string().nullish(),
  storyUrl: z.string().nullish(),
  attachments: Files,
});

const Commented = z.object({
  ...Thread,
  commentId: z.string(),
  text: z.string().default(''),
  attachments: Files,
});

const Echoed = z.object({
  ...Thread,
  messageId: z.string(),
  text: z.string().default(''),
  attachments: Files,
});

const Deleted = z.object({ ...Thread, messageId: z.string() });

const Reacted = z.object({
  ...Thread,
  messageId: z.string(),
  emoji: z.string().nullish(),
  action: z.enum(['react', 'unreact']),
});

type Inbound = {
  orgId: string;
  kind: MetaKind;
  customerId: string;
  connectionId: string;
  threadId: string;
};

const integrationOf = async (tx: Tx, { kind, connectionId }: Inbound) => {
  const [found] = await tx
    .select({ id: integrations.id })
    .from(integrations)
    .where(
      and(
        eq(integrations.kind, kind),
        sql`${integrations.config} ->> 'connectionId' = ${connectionId}`,
        eq(integrations.isActive, true),
      ),
    )
    .orderBy(integrations.createdAt, integrations.id)
    .limit(1);

  return found?.id;
};

const conversationOf = async (tx: Tx, inbound: Inbound) => {
  const integrationId = await integrationOf(tx, inbound);

  if (!integrationId) return undefined;

  const [found] = await tx
    .select({ id: conversations.id, customerId: conversations.customerId })
    .from(conversations)
    .where(
      and(
        eq(conversations.integrationId, integrationId),
        eq(conversations.externalId, inbound.threadId),
      ),
    )
    .for('update');

  return found;
};

const keep = async (
  inbound: Inbound,
  message: {
    messageId: string;
    content: string;
    attachments: StoredFile[];
    quotedId?: string | null;
  },
) => {
  const { orgId } = inbound;

  await withOrg(orgId, async (tx) => {
    const integrationId = await integrationOf(tx, inbound);

    if (!integrationId) {
      logger.info({ orgId, connectionId: inbound.connectionId }, 'Meta message for no channel');

      return;
    }

    const received = await receiveIn(tx, orgId, {
      integrationId,
      customerId: inbound.customerId,
      externalConversationId: inbound.threadId,
      externalId: message.messageId,
      content: message.content,
      attachments: message.attachments,
      quotedExternalId: message.quotedId ?? undefined,
    });

    if (!received.changed) return;

    await copiesOf(message.attachments)?.(tx, received.message);
    await signalConversations(tx, orgId, [received.changed]);
  }).catch((error: unknown) => {
    if (!refusedData(error)) throw error;

    logger.error(
      { err: error, orgId, messageId: message.messageId },
      'Meta message the inbox cannot store, skipped',
    );
  });
};

const received = (inbound: Inbound, payload: unknown) => {
  const event = Received.parse(payload);
  const story = event.storyUrl ? [{ url: event.storyUrl, name: 'story', type: 'story' }] : [];

  return keep(inbound, {
    messageId: event.messageId,
    content: event.text,
    attachments: [...story, ...event.attachments],
    quotedId: event.replyToMessageId,
  });
};

const commented = (inbound: Inbound, payload: unknown) => {
  const event = Commented.parse(payload);

  return keep(inbound, {
    messageId: event.commentId,
    content: event.text,
    attachments: event.attachments,
  });
};

const echoed = (inbound: Inbound, payload: unknown) => {
  const event = Echoed.parse(payload);
  const { orgId } = inbound;

  return withOrg(orgId, async (tx) => {
    const conversation = await conversationOf(tx, inbound);

    if (!conversation) return;

    const inThread = (match: SQL) =>
      tx
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.conversationId, conversation.id), match))
        .limit(1);

    const [known] = await inThread(eq(messages.externalId, event.messageId));

    if (known) return;

    const [pending] = await inThread(inArray(messages.deliveryStatus, ['queued', 'sending']));

    if (pending) throw new Error('A reply in this thread is still on its way to Meta');

    const [message] = await tx
      .insert(messages)
      .values({
        orgId,
        conversationId: conversation.id,
        content: event.text,
        attachments: event.attachments,
        externalId: event.messageId,
        deliveryStatus: 'sent',
      })
      .onConflictDoNothing()
      .returning({ id: messages.id, orgId: messages.orgId, createdAt: messages.createdAt });

    if (!message) return;

    await tx
      .update(conversations)
      .set({
        content: event.text,
        messageCount: sql`${conversations.messageCount} + 1`,
        lastMessageAt: message.createdAt,
        customerRespondedLast: false,
      })
      .where(eq(conversations.id, conversation.id));

    await copiesOf(event.attachments)?.(tx, message);
    await signalConversations(tx, orgId, [conversation]);
  });
};

const deleted = (inbound: Inbound, payload: unknown) => {
  const event = Deleted.parse(payload);

  return withOrg(inbound.orgId, async (tx) => {
    const conversation = await conversationOf(tx, inbound);

    if (!conversation) return;

    const removed = await tx
      .update(messages)
      .set({ content: '', attachments: [], deletedAt: sql`now()` })
      .where(
        and(eq(messages.conversationId, conversation.id), eq(messages.externalId, event.messageId)),
      )
      .returning({ id: messages.id });

    if (removed.length) await signalConversations(tx, inbound.orgId, [conversation]);
  });
};

const reacted = (inbound: Inbound, payload: unknown) => {
  const event = Reacted.parse(payload);

  return withOrg(inbound.orgId, async (tx) => {
    const conversation = await conversationOf(tx, inbound);

    if (!conversation) return;

    const [message] = await tx
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(eq(messages.conversationId, conversation.id), eq(messages.externalId, event.messageId)),
      );

    if (!message) return;

    await tx
      .delete(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, message.id),
          eq(messageReactions.customerId, inbound.customerId),
        ),
      );

    if (event.action === 'react' && event.emoji)
      await tx.insert(messageReactions).values({
        orgId: inbound.orgId,
        messageId: message.id,
        customerId: inbound.customerId,
        emoji: event.emoji,
      });

    await signalMembers(tx, inbound.orgId, [conversation.id]);
  });
};

const { messenger, facebook, instagram } = META_EVENTS;

const HANDLERS = new Map<
  string,
  { kind: MetaKind; handle: (inbound: Inbound, payload: unknown) => Promise<unknown> }
>([
  [messenger.received, { kind: 'facebook', handle: received }],
  [messenger.sent, { kind: 'facebook', handle: echoed }],
  [messenger.deleted, { kind: 'facebook', handle: deleted }],
  [messenger.reaction, { kind: 'facebook', handle: reacted }],
  [facebook.comment, { kind: 'facebook', handle: commented }],
  [instagram.received, { kind: 'instagram', handle: received }],
  [instagram.sent, { kind: 'instagram', handle: echoed }],
  [instagram.deleted, { kind: 'instagram', handle: deleted }],
  [instagram.reaction, { kind: 'instagram', handle: reacted }],
  [instagram.comment, { kind: 'instagram', handle: commented }],
]);

export const isMetaEvent = (type: string) => HANDLERS.has(type);

export const receiveMetaEvent = async (event: DeliveredEvent) => {
  const handler = HANDLERS.get(event.type);
  const { subjectType, subjectId, payload } = event.data;

  if (!handler) return;

  if (subjectType !== 'customer' || !subjectId) {
    logger.warn({ eventId: event.id, type: event.type }, 'Meta event without a customer, skipped');

    return;
  }

  const thread = z.object(Thread).parse(payload);

  await handler.handle(
    {
      orgId: event.organizationId,
      kind: handler.kind,
      customerId: subjectId,
      ...thread,
    },
    payload,
  );
};
