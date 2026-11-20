import { META_EVENTS } from '@erxes/core-contract';
import { describe, expect, it, vi } from 'vite-plus/test';
import { clientAs } from '#/test/member.ts';
import { asked } from './standIns.ts';
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

const { facebook, instagram } = META_EVENTS;

const messagesOf = async (orgId: string, conversationId: string) =>
  (await clientAs(orgId).conversations.messages.list({ conversationId })).messages;

describe('facebook comments', () => {
  it('threads a person’s comments on a post, shows the post and answers under their comment', async () => {
    const orgId = 'org-fb-comments';
    const { owner, connection } = await metaChannel(orgId, 'facebook');
    const threadId = 'comment:page-1_post-9:asid-7';

    const comment = (commentId: string, text: string) =>
      event(
        metaEvent(orgId, facebook.comment, 'customer-asid', {
          connectionId: connection.id,
          threadId,
          postId: 'page-1_post-9',
          commentId,
          text,
        }),
      );

    expect(await comment('post-9_c1-deleted', 'How much is the blue one?')).toBe(204);
    expect(await comment('post-9_c2', 'And in size M?')).toBe(204);

    const conversationId = await conversationWith(orgId, threadId);
    const [latest, first] = await messagesOf(orgId, conversationId);

    expect([latest?.content, first?.content]).toEqual([
      'And in size M?',
      'How much is the blue one?',
    ]);
    expect(await owner.integrations.meta.posts.get({ conversationId })).toEqual({
      id: 'page-1_post-9',
      content: 'New blue jackets are in',
      permalink: 'https://www.facebook.com/page-1/posts/9',
      imageUrl: 'https://cdn.example.com/jacket.jpg',
      createdAt: '2025-11-15T04:00:00+0000',
    });

    asked.metaSent.length = 0;
    await owner.conversations.messages.create({ conversationId, content: 'It is 120,000₮' });
    await runQueued();

    const reply = await owner.conversations.messages.create({
      conversationId,
      content: 'Blue is sold out',
      replyToId: first?.id ?? null,
    });

    await runQueued();

    expect(asked.metaSent).toEqual([
      expect.objectContaining({
        kind: 'comment_reply',
        connectionId: connection.id,
        commentId: 'post-9_c2',
        text: '@[asid-7] It is 120,000₮',
      }),
      expect.objectContaining({
        commentId: 'post-9_c1-deleted',
        idempotencyKey: `frontline:${reply.id}`,
      }),
      expect.objectContaining({
        commentId: 'post-9_c2',
        idempotencyKey: `frontline:${reply.id}:latest`,
        text: '@[asid-7] Blue is sold out',
      }),
    ]);
    expect((await messagesOf(orgId, conversationId))[0]).toMatchObject({
      id: reply.id,
      deliveryStatus: 'sent',
      externalId: `mid.frontline:${reply.id}:latest`,
    });
  });

  it('lists the page’s posts and publishes one', async () => {
    const { owner, connection } = await metaChannel('org-fb-posts', 'facebook');

    expect(await owner.integrations.meta.posts.list({ connectionId: connection.id })).toMatchObject(
      { posts: [{ id: 'page-1_post-9', content: 'New blue jackets are in' }], next: 'cursor-2' },
    );
    expect(
      await owner.integrations.meta.posts.create({
        connectionId: connection.id,
        message: 'Open on Sunday',
        link: 'https://shop.example.com/hours',
      }),
    ).toEqual({ id: 'page-1_post-new' });
    expect(asked.metaGraph.at(-1)).toEqual({
      connectionId: connection.id,
      path: 'page-1/feed',
      method: 'POST',
      query: {},
      body: { message: 'Open on Sunday', link: 'https://shop.example.com/hours' },
    });
    await expect(
      owner.integrations.meta.posts.create({ connectionId: connection.id, message: 'refused' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Meta refused: Invalid parameter' });
  });
});

describe('instagram', () => {
  it('keeps a story reply, threads comments on media and answers without a mention', async () => {
    const orgId = 'org-ig-a';
    const { owner, connection } = await metaChannel(orgId, 'instagram');
    const threadId = 'comment:media-3:igsid-5';

    await event(
      metaEvent(orgId, instagram.received, 'customer-saraa', {
        connectionId: connection.id,
        threadId: 'igsid-6',
        messageId: 'ig_m1',
        text: 'Love this!',
        storyUrl:
          'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=story-1&signature=expired',
      }),
    );
    await event(
      metaEvent(orgId, instagram.comment, 'customer-igsid-5', {
        connectionId: connection.id,
        threadId,
        postId: 'media-3',
        commentId: 'ig-c1',
        text: 'All sizes?',
      }),
    );
    fakeProviders(metaCdn);
    await runQueued();

    const story = await messagesOf(orgId, await conversationWith(orgId, 'igsid-6'));

    expect(story.map(({ content, attachments }) => ({ content, attachments }))).toEqual([
      {
        content: 'Love this!',
        attachments: [
          {
            url: 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=story-1&signature=expired',
            name: 'story',
            type: 'story',
          },
        ],
      },
    ]);

    const conversationId = await conversationWith(orgId, threadId);

    expect(await owner.integrations.meta.posts.get({ conversationId })).toMatchObject({
      id: 'media-3',
      content: 'Autumn drop',
      imageUrl: 'https://cdn.example.com/drop.jpg',
    });

    const reply = await owner.conversations.messages.create({
      conversationId,
      content: 'Yes, all sizes',
    });

    await runQueued();

    expect(asked.metaSent.at(-1)).toEqual({
      kind: 'comment_reply',
      connectionId: connection.id,
      idempotencyKey: `frontline:${reply.id}`,
      commentId: 'ig-c1',
      text: 'Yes, all sizes',
      fileId: undefined,
    });
    expect((await clientAs('org-ig-b').conversations.list({})).totalCount).toBe(0);
  });
});
