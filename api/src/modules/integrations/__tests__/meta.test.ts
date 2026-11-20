import { META_EVENTS } from '@erxes/core-contract';
import { describe, expect, it, vi } from 'vite-plus/test';
import { clientAs } from '#/test/member.ts';
import { connectMeta } from './standIns.ts';
import {
  conversationWith,
  fakeProviders,
  metaCdn,
  metaChannel,
  metaEvent,
  runQueued,
  serve,
} from './fakes.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('./standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('./standIns.ts')).sdkStandIn(await importOriginal()),
);

const { event } = serve();

const { messenger } = META_EVENTS;

const messagesOf = async (orgId: string, conversationId: string) =>
  (await clientAs(orgId).conversations.messages.list({ conversationId })).messages;

describe('messenger events', () => {
  it('keeps what a person writes to the page once, with its files and quotes', async () => {
    const orgId = 'org-fb-in';
    const { connection } = await metaChannel(orgId, 'facebook');
    const thread = { connectionId: connection.id, threadId: 'psid-1' };

    const question = metaEvent(orgId, messenger.received, 'customer-bat', {
      ...thread,
      messageId: 'm_1',
      text: 'Do you ship to Darkhan?',
    });

    expect(await event(question, 'forged')).toBe(401);
    expect(await event(question)).toBe(204);
    expect(await event(question)).toBe(204);

    const files = metaEvent(orgId, messenger.received, 'customer-bat', {
      ...thread,
      messageId: 'm_2',
      replyToMessageId: 'm_1',
      attachments: [
        { url: 'https://scontent.xx.fbcdn.net/v/photo.jpg?signature=ok', type: 'image' },
        {
          url: 'https://cdn.fbsbx.com/v/invoice.pdf?signature=expired',
          name: 'invoice.pdf',
          type: 'file',
        },
      ],
    });

    expect(await event(files)).toBe(204);
    fakeProviders(metaCdn);
    await runQueued();

    const conversationId = await conversationWith(orgId, 'psid-1');
    const { conversations } = await clientAs(orgId).conversations.list({});

    expect(conversations).toMatchObject([{ customerId: 'customer-bat', messageCount: 2 }]);
    expect(
      (await messagesOf(orgId, conversationId)).map(
        ({ content, attachments, quotedContent, customerId }) => ({
          content,
          attachments,
          quotedContent,
          customerId,
        }),
      ),
    ).toEqual([
      {
        content: '',
        attachments: [
          {
            url: '/core/v1/files/file-photo-jpg/download',
            name: 'photo.jpg',
            type: 'image/jpeg',
            size: 4,
          },
          {
            url: 'https://cdn.fbsbx.com/v/invoice.pdf?signature=expired',
            name: 'invoice.pdf',
            type: 'file',
          },
        ],
        quotedContent: 'Do you ship to Darkhan?',
        customerId: 'customer-bat',
      },
      {
        content: 'Do you ship to Darkhan?',
        attachments: [],
        quotedContent: null,
        customerId: 'customer-bat',
      },
    ]);
    expect((await clientAs('org-fb-other').conversations.list({})).totalCount).toBe(0);
  });

  it('keeps a tapped button as its title and leaves out what no channel takes', async () => {
    const orgId = 'org-fb-postback';
    const { connection } = await metaChannel(orgId, 'facebook');
    const elsewhere = connectMeta(orgId, 'facebook', { externalId: 'page-2' });

    expect(
      await event(
        metaEvent(orgId, messenger.received, 'customer-bat', {
          connectionId: connection.id,
          threadId: 'psid-1',
          messageId: 'm_postback',
          text: 'Opening hours',
          payload: '{"botId":"bot-1","itemId":"hours"}',
        }),
      ),
    ).toBe(204);
    expect(
      await event(
        metaEvent(orgId, messenger.received, 'customer-saraa', {
          connectionId: elsewhere.id,
          threadId: 'psid-2',
          messageId: 'm_elsewhere',
          text: 'Hello?',
        }),
      ),
    ).toBe(204);

    const noCustomer = metaEvent(orgId, messenger.received, 'customer-bat', {
      connectionId: connection.id,
      threadId: 'psid-3',
      messageId: 'm_3',
      text: 'Hi',
    });

    expect(
      await event({
        ...noCustomer,
        data: { ...noCustomer.data, subjectType: null, subjectId: null },
      }),
    ).toBe(204);

    const { conversations } = await clientAs(orgId).conversations.list({});

    expect(conversations.map(({ externalId, content }) => ({ externalId, content }))).toEqual([
      { externalId: 'psid-1', content: 'Opening hours' },
    ]);
  });

  it('keeps what the page sent elsewhere, after the team’s own reply is on its way', async () => {
    const orgId = 'org-fb-echo';
    const { owner, connection } = await metaChannel(orgId, 'facebook');
    const thread = { connectionId: connection.id, threadId: 'psid-1' };

    await event(
      metaEvent(orgId, messenger.received, 'customer-bat', {
        ...thread,
        messageId: 'm_1',
        text: 'Is it open?',
      }),
    );

    const conversationId = await conversationWith(orgId, 'psid-1');

    const echo = (messageId: string, text: string) =>
      event(
        metaEvent(orgId, messenger.sent, 'customer-bat', {
          ...thread,
          messageId,
          text,
          appId: 'page-inbox',
        }),
      );

    expect(await echo('m_page', 'Yes, until 8')).toBe(204);
    expect(await echo('m_page', 'Yes, until 8')).toBe(204);

    const reply = await owner.conversations.messages.create({ conversationId, content: 'See you' });

    expect(await echo('m_unknown', 'See you')).toBe(500);

    await runQueued();

    expect(await echo(`mid.frontline:${reply.id}`, 'See you')).toBe(204);
    expect(
      (await messagesOf(orgId, conversationId)).map(
        ({ content, userId, customerId, deliveryStatus }) => ({
          content,
          userId,
          customerId,
          deliveryStatus,
        }),
      ),
    ).toEqual([
      { content: 'See you', userId: `user-${orgId}`, customerId: null, deliveryStatus: 'sent' },
      { content: 'Yes, until 8', userId: null, customerId: null, deliveryStatus: 'sent' },
      { content: 'Is it open?', userId: null, customerId: 'customer-bat', deliveryStatus: null },
    ]);
  });

  it('clears a message the person deleted and keeps their reaction to the team’s', async () => {
    const orgId = 'org-fb-change';
    const { connection } = await metaChannel(orgId, 'facebook');
    const thread = { connectionId: connection.id, threadId: 'psid-1' };

    await event(
      metaEvent(orgId, messenger.received, 'customer-bat', {
        ...thread,
        messageId: 'm_1',
        text: 'My card is 4000 0000',
      }),
    );
    await event(
      metaEvent(orgId, messenger.received, 'customer-bat', {
        ...thread,
        messageId: 'm_2',
        text: 'Thanks',
      }),
    );

    const conversationId = await conversationWith(orgId, 'psid-1');

    const reacted = (action: 'react' | 'unreact', emoji?: string) =>
      event(
        metaEvent(orgId, messenger.reaction, 'customer-bat', {
          ...thread,
          messageId: 'm_2',
          action,
          emoji,
        }),
      );

    expect(
      await event(
        metaEvent(orgId, messenger.deleted, 'customer-bat', { ...thread, messageId: 'm_1' }),
      ),
    ).toBe(204);
    expect(await reacted('react', '😮')).toBe(204);
    expect(await reacted('react', '❤')).toBe(204);

    const [thanks, deleted] = await messagesOf(orgId, conversationId);

    expect(deleted?.content).toBe('');
    expect(deleted?.deletedAt).toBeInstanceOf(Date);
    expect(thanks?.reactions).toEqual([{ emoji: '❤', count: 1, mine: false }]);

    await reacted('unreact');

    expect((await messagesOf(orgId, conversationId))[0]?.reactions).toEqual([]);
  });
});
