import { META_EVENTS } from '@erxes/core-contract';
import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vite-plus/test';
import { JOBS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { asked } from './standIns.ts';
import { conversationWith, metaChannel, metaEvent, runJob, runQueued, serve } from './fakes.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('./standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('./standIns.ts')).sdkStandIn(await importOriginal()),
);

const { event } = serve();

const chatting = async (orgId: string, kind: 'facebook' | 'instagram' = 'facebook') => {
  const { owner, connection } = await metaChannel(orgId, kind);

  const received =
    kind === 'facebook' ? META_EVENTS.messenger.received : META_EVENTS.instagram.received;

  await event(
    metaEvent(orgId, received, 'customer-bat', {
      connectionId: connection.id,
      threadId: 'psid-1',
      messageId: 'm_1',
      text: 'Do you ship to Darkhan?',
    }),
  );

  const conversationId = await conversationWith(orgId, 'psid-1');
  const [question] = (await owner.conversations.messages.list({ conversationId })).messages;

  return { owner, connection, conversationId, question };
};

describe('meta replies', () => {
  it('sends a reply with its files and quote through core, once per message', async () => {
    const { owner, connection, conversationId, question } = await chatting('org-ms-a');

    const reply = await owner.conversations.messages.create({
      conversationId,
      content: 'We do, both invoices attached',
      replyToId: question?.id ?? null,
      attachments: ['a', 'b'].map((id) => ({
        url: `/core/v1/files/file-${id}/download`,
        name: `${id}.pdf`,
      })),
    });

    await runQueued();

    expect(asked.metaSent.at(-1)).toEqual({
      kind: 'message',
      connectionId: connection.id,
      idempotencyKey: `frontline:${reply.id}`,
      recipientId: 'psid-1',
      text: 'We do, both invoices attached',
      fileIds: ['file-a', 'file-b'],
      replyToMessageId: 'm_1',
      humanAgent: false,
    });

    const { messages } = await owner.conversations.messages.list({ conversationId });

    expect(messages[0]).toMatchObject({
      id: reply.id,
      deliveryStatus: 'sent',
      externalId: `mid.frontline:${reply.id}`,
    });
  });

  it('replies after the 24 hours as a person, counted from the customer’s message', async () => {
    const { owner, conversationId } = await chatting('org-ms-late', 'instagram');

    await withOrg('org-ms-late', (tx) =>
      tx.execute(sql`update frontline_messages set created_at = now() - interval '2 days'`),
    );

    await owner.conversations.messages.create({ conversationId, content: 'Sorry for the wait' });
    await runQueued();
    expect(asked.metaSent.at(-1)).toMatchObject({ text: 'Sorry for the wait', humanAgent: true });

    await owner.conversations.messages.create({ conversationId, content: 'It ships today' });
    await runQueued();
    expect(asked.metaSent.at(-1)).toMatchObject({ text: 'It ships today', humanAgent: true });
  });

  it('fails a reply an earlier attempt claimed and never settled, and sends nothing twice', async () => {
    const { owner, conversationId } = await chatting('org-ms-claimed');
    const reply = await owner.conversations.messages.create({ conversationId, content: 'Hello?' });
    const job = { orgId: 'org-ms-claimed', name: JOBS.send.name, payload: { messageId: reply.id } };

    asked.jobs.length = 0;

    const statusOf = async () =>
      (await owner.conversations.messages.list({ conversationId })).messages.find(
        (message) => message.id === reply.id,
      )?.deliveryStatus;

    const sent = () =>
      asked.metaSent.filter((input) => input.idempotencyKey === `frontline:${reply.id}`).length;

    await withOrg('org-ms-claimed', (tx) =>
      tx.execute(sql`update frontline_messages set delivery_status = 'sending'
        where id = ${reply.id}`),
    );
    await runJob(job);
    expect(await statusOf()).toBe('failed');
    expect(sent()).toBe(0);

    await owner.conversations.messages.retry({ id: reply.id });
    await runQueued();
    await runJob(job, 2);
    expect(await statusOf()).toBe('sent');
    expect(sent()).toBe(1);
  });

  it('fails a reply whose send never ran within 15 minutes, and sends it again on request', async () => {
    const { owner, conversationId } = await chatting('org-ms-stuck');
    const reply = await owner.conversations.messages.create({ conversationId, content: 'Hello?' });

    const statusOf = async () =>
      (await owner.conversations.messages.list({ conversationId })).messages.find(
        (message) => message.id === reply.id,
      )?.deliveryStatus;

    const sent = () =>
      asked.metaSent.filter((input) => input.idempotencyKey === `frontline:${reply.id}`).length;

    expect(await statusOf()).toBe('queued');

    await withOrg('org-ms-stuck', (tx) =>
      tx.execute(sql`update frontline_messages set queued_at = now() - interval '16 minutes'
        where id = ${reply.id}`),
    );
    expect(await statusOf()).toBe('failed');

    await runQueued();
    expect(sent()).toBe(0);
    expect(await statusOf()).toBe('failed');

    await expect(owner.conversations.messages.retry({ id: reply.id })).resolves.toMatchObject({
      deliveryStatus: 'queued',
    });
    await runQueued();
    expect(await statusOf()).toBe('sent');
    expect(sent()).toBe(1);
  });
});

describe('meta reactions', () => {
  it('shows the team’s ❤ on the customer’s message, takes it back, and refuses any other', async () => {
    const { owner, connection, question } = await chatting('org-ms-react');
    const id = question?.id ?? '';

    await expect(owner.conversations.messages.react({ id, emoji: '❤️' })).resolves.toEqual({
      reactions: [{ emoji: '❤️', count: 1, mine: true }],
    });
    expect(asked.metaSent.at(-1)).toMatchObject({
      kind: 'reaction',
      connectionId: connection.id,
      recipientId: 'psid-1',
      messageId: 'm_1',
      on: true,
    });

    await owner.conversations.messages.react({ id, emoji: '❤️', remove: true });
    expect(asked.metaSent.at(-1)).toMatchObject({ kind: 'reaction', messageId: 'm_1', on: false });

    const before = asked.metaSent.length;

    await expect(owner.conversations.messages.react({ id, emoji: '👍' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Meta takes only ❤️ on a message',
    });
    expect(asked.metaSent).toHaveLength(before);
    expect(
      (await owner.conversations.messages.list({ conversationId: question?.conversationId ?? '' }))
        .messages[0]?.reactions,
    ).toEqual([]);
  });

  it('refuses a reaction on a comment', async () => {
    const orgId = 'org-ms-comment';
    const { owner, connection } = await metaChannel(orgId, 'facebook');
    const threadId = 'comment:page-1_post-9:asid-7';

    await event(
      metaEvent(orgId, META_EVENTS.facebook.comment, 'customer-asid', {
        connectionId: connection.id,
        threadId,
        postId: 'page-1_post-9',
        commentId: 'post-9_c1',
        text: 'Price?',
      }),
    );

    const conversationId = await conversationWith(orgId, threadId);
    const [comment] = (await owner.conversations.messages.list({ conversationId })).messages;

    await expect(
      owner.conversations.messages.react({ id: comment?.id ?? '', emoji: '❤️' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
