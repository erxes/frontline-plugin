import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { SEND_ACTIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { clientAs } from '#/test/member.ts';
import { asked } from './standIns.ts';
import {
  conversationWith,
  fakeProviders,
  fixture,
  graphApi,
  lastPost,
  runQueued,
  serve,
  signedByMeta,
} from './fakes.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('./standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('./standIns.ts')).sdkStandIn(await importOriginal()),
);

const { connectMeta: connected, deliver, act } = serve();

const eventsOf = (orgId: string) =>
  withOrg(orgId, (tx) =>
    tx.execute(sql`select type, coalesce(payload ->> 'commentId', payload ->> 'payload') as detail
      from core_events where type like 'frontline.facebook.%' order by type, seq`),
  );

describe('facebook comments and postbacks', () => {
  it('threads a person comments on a post, shows the post and answers under their comment', async () => {
    const calls = fakeProviders(graphApi);
    const { owner } = await connected('org-fb-a', 'facebook');
    const raw = fixture('meta-feed.json');

    expect(await deliver('/meta', raw, signedByMeta(raw))).toBe(200);
    // Meta delivers again until it hears 200; the repeat adds nothing.
    expect(await deliver('/meta', raw, signedByMeta(raw))).toBe(200);
    // A job copies the comment's photo off Meta's CDN once Meta has its answer.
    await runQueued();

    const threadId = await conversationWith('org-fb-a', 'comment:page-1_post-9:asid-7');
    const { messages } = await owner.conversations.messages.list({ conversationId: threadId });

    // Newest first; the page's own comment and the like are left out.
    expect(
      messages.map(({ content, attachments, externalId }) => ({
        content,
        attachments,
        externalId,
      })),
    ).toEqual([
      {
        content: 'And in size M?',
        // Meta's link expires, so the photo is kept in core.
        attachments: [
          {
            url: '/core/v1/files/file-size-jpg/download',
            name: 'size.jpg',
            type: 'image/jpeg',
            size: 4,
          },
        ],
        externalId: 'post-9_c2',
      },
      { content: 'How much is the blue one?', attachments: [], externalId: 'post-9_c1' },
    ]);

    expect(await owner.integrations.meta.posts.get({ conversationId: threadId })).toEqual({
      id: 'page-1_post-9',
      content: 'New blue jackets are in',
      permalink: 'https://www.facebook.com/page-1/posts/9',
      imageUrl: 'https://cdn.example.com/jacket.jpg',
      createdAt: '2025-11-15T04:00:00+0000',
    });

    await owner.conversations.messages.create({
      conversationId: threadId,
      content: 'It is 120,000₮',
    });
    await runQueued();

    expect(lastPost(calls)).toMatchObject({
      url: new URL('https://graph.facebook.com/v23.0/post-9_c2/comments'),
      authorization: 'Bearer page-token-1',
      body: { message: '@[asid-7] It is 120,000₮' },
    });

    // A picked comment the customer deleted is answered at their latest instead.
    const retried = fakeProviders((call) =>
      call.url.pathname.endsWith('post-9_c1/comments')
        ? Response.json({ error: { message: 'Object does not exist' } }, { status: 400 })
        : { id: 'reply-sold-out' },
    );

    await owner.conversations.messages.create({
      conversationId: threadId,
      content: 'Blue is sold out',
      replyToId: messages[1]?.id ?? null,
    });
    await runQueued();

    expect(retried.map(({ url }) => url.pathname)).toEqual([
      '/v23.0/post-9_c1/comments',
      '/v23.0/post-9_c2/comments',
    ]);

    const chatId = await conversationWith('org-fb-a', 'psid-2');
    const chat = await owner.conversations.messages.list({ conversationId: chatId });

    // A tapped button and a quick reply read as what the customer chose.
    expect(chat.messages.map(({ content }) => content)).toEqual(['Yes', 'Opening hours']);
    expect(await owner.integrations.meta.posts.get({ conversationId: chatId })).toBeNull();

    // Each new message once, for automations to start from, with the comment or the payload.
    expect((await eventsOf('org-fb-a')).rows).toEqual([
      { type: 'frontline.facebook.comment_received', detail: 'post-9_c1' },
      { type: 'frontline.facebook.comment_received', detail: 'post-9_c2' },
      { type: 'frontline.facebook.message_received', detail: '{"botId":"bot-1","menuId":"hours"}' },
      { type: 'frontline.facebook.message_received', detail: 'CONFIRM' },
    ]);
  });

  it('lists the page’s posts and publishes one', async () => {
    const calls = fakeProviders(graphApi);
    const { owner, account } = await connected('org-fb-c', 'facebook');

    expect(await owner.integrations.meta.posts.list({ accountId: account.id })).toMatchObject({
      posts: [{ id: 'page-1_post-9', content: 'New blue jackets are in' }],
      next: 'cursor-2',
    });

    expect(
      await owner.integrations.meta.posts.create({
        accountId: account.id,
        message: 'Open on Sunday',
        link: 'https://shop.example.com/hours',
      }),
    ).toEqual({ id: 'page-1_post-new' });
    expect(lastPost(calls)).toMatchObject({
      url: new URL('https://graph.facebook.com/v23.0/page-1/feed'),
      body: { message: 'Open on Sunday', link: 'https://shop.example.com/hours' },
    });

    await expect(
      owner.integrations.meta.posts.create({ accountId: account.id, message: 'refused' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Meta refused: Invalid parameter' });
  });
});

describe('instagram comments', () => {
  it('threads comments on media, keeps a story reply and answers in the thread', async () => {
    const calls = fakeProviders(graphApi);
    const { owner } = await connected('org-ig-a', 'instagram');
    const raw = fixture('instagram-comments.json');

    expect(await deliver('/meta', raw, signedByMeta(raw))).toBe(200);

    const threadId = await conversationWith('org-ig-a', 'comment:media-3:igsid-5');

    await owner.conversations.messages.create({
      conversationId: threadId,
      content: 'Yes, all sizes',
    });
    await runQueued();

    expect(lastPost(calls)).toMatchObject({
      url: new URL('https://graph.facebook.com/v23.0/ig-c1/replies'),
      body: { message: 'Yes, all sizes' },
    });

    const storyId = await conversationWith('org-ig-a', 'igsid-6');
    const { messages } = await owner.conversations.messages.list({ conversationId: storyId });

    // The deleted message is left out.
    expect(messages.map(({ content, attachments }) => ({ content, attachments }))).toEqual([
      {
        content: 'Love this!',
        // The story's link had expired before the copy, so the message keeps the link.
        attachments: [
          {
            url: 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=story-1&signature=expired',
            name: 'story',
            type: 'story',
          },
        ],
      },
    ]);
    // Instagram's messages carry only the sender's id; their name comes from Instagram's profile.
    expect(asked.created).toContainEqual(
      expect.objectContaining({ firstName: 'Saraa', source: 'instagram' }),
    );
    expect((await clientAs('org-ig-b').conversations.list({})).totalCount).toBe(0);
  });
});

describe('bots', () => {
  const settings = {
    name: 'Shop bot',
    persistentMenu: [
      { id: 'hours', type: 'postback' as const, title: 'Opening hours' },
      { id: 'site', type: 'link' as const, title: 'Our site', url: 'https://shop.example.com' },
    ],
    iceBreakers: [],
    getStartedText: 'Start',
    greeting: 'Hi {{user_first_name}}',
  };

  it('sets the page’s Messenger profile, changes it and clears it', async () => {
    const calls = fakeProviders(graphApi);
    const { owner, account } = await connected('org-bot-a', 'facebook');

    const bot = await owner.integrations.meta.bots.create({ ...settings, accountId: account.id });

    expect(bot).toMatchObject({
      name: 'Shop bot',
      accountName: 'Shop',
      provider: 'facebook',
      status: 'healthy',
    });

    const payload = (itemId?: string) => JSON.stringify({ botId: bot.id, itemId });
    const profileCalls = calls.filter((call) => call.url.pathname.endsWith('me/messenger_profile'));

    expect(profileCalls.map(({ method, body }) => ({ method, body }))).toEqual([
      {
        method: 'POST',
        body: {
          get_started: { payload: payload() },
          persistent_menu: [
            {
              locale: 'default',
              composer_input_disabled: false,
              call_to_actions: [
                { type: 'postback', title: 'Start', payload: payload() },
                { type: 'postback', title: 'Opening hours', payload: payload('hours') },
                {
                  type: 'web_url',
                  title: 'Our site',
                  url: 'https://shop.example.com',
                  webview_height_ratio: 'full',
                },
              ],
            },
          ],
          greeting: [{ locale: 'default', text: 'Hi {{user_first_name}}' }],
        },
      },
      { method: 'DELETE', body: { fields: ['ice_breakers'] } },
    ]);

    await expect(
      owner.integrations.meta.bots.create({ ...settings, accountId: account.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: 'This page already has a bot' });

    await expect(
      owner.integrations.meta.bots.update({ ...settings, id: bot.id, greeting: 'refused' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Meta refused: Invalid parameter' });
    // Meta's refusal undid the change.
    expect(await owner.integrations.meta.bots.get({ id: bot.id })).toMatchObject({
      greeting: 'Hi {{user_first_name}}',
    });

    await owner.integrations.meta.bots.update({
      ...settings,
      id: bot.id,
      persistentMenu: [],
      iceBreakers: [{ id: 'q1', question: 'Where are you?' }],
      greeting: null,
    });

    expect(calls.at(-1)).toMatchObject({
      method: 'DELETE',
      body: { fields: ['persistent_menu', 'greeting'] },
    });
    expect((await clientAs('org-bot-b').integrations.meta.bots.list()).bots).toEqual([]);

    await owner.integrations.meta.bots.remove({ id: bot.id });

    expect(calls.at(-1)).toMatchObject({
      method: 'DELETE',
      body: { fields: ['get_started', 'persistent_menu', 'greeting', 'ice_breakers'] },
    });
    expect((await owner.integrations.meta.bots.list()).bots).toEqual([]);
  });

  it('sets an Instagram account’s menu and ice breakers only', async () => {
    const calls = fakeProviders(graphApi);
    const { owner, account } = await connected('org-bot-c', 'instagram');

    await owner.integrations.meta.bots.create({
      ...settings,
      accountId: account.id,
      iceBreakers: [{ id: 'q1', question: 'Do you ship?' }],
    });

    const [profile] = calls.filter((call) => call.url.pathname.endsWith('me/messenger_profile'));

    expect(profile?.url.searchParams.get('platform')).toBe('instagram');
    expect(Object.keys(z.record(z.string(), z.unknown()).parse(profile?.body))).toEqual([
      'persistent_menu',
      'ice_breakers',
    ]);
  });
});

describe('automation replies', () => {
  it('answers the conversation the trigger names once per step', async () => {
    const calls = fakeProviders(graphApi);
    const { owner } = await connected('org-meta-auto-a', 'facebook');
    const raw = fixture('meta-delivery.json');

    await deliver('/meta', raw, signedByMeta(raw));
    await runQueued();

    const conversationId = await conversationWith('org-meta-auto-a', 'psid-1');

    const step = {
      input: { message: 'Thanks, we got it' },
      context: { event: { payload: { conversationId } } },
    };

    const run = { orgId: 'org-meta-auto-a', run: 'run-1' };
    const first = await act(SEND_ACTIONS.facebook.type, step, run);

    expect(first).toMatchObject({ status: 200, body: { conversationId } });
    expect(await act(SEND_ACTIONS.facebook.type, step, run)).toEqual(first);
    expect(asked.jobs.length).toBe(1);

    await runQueued();

    expect(lastPost(calls)?.body).toMatchObject({ message: { text: 'Thanks, we got it' } });

    const { messages } = await owner.conversations.messages.list({ conversationId });

    expect(messages[0]).toMatchObject({
      content: 'Thanks, we got it',
      userId: 'user-org-meta-auto-a',
      deliveryStatus: 'sent',
    });

    // The customer of the subject has no Instagram conversation.
    expect(
      await act(
        SEND_ACTIONS.instagram.type,
        { input: { message: 'Hi' }, context: { subject: { id: 'customer-1' } } },
        { orgId: 'org-meta-auto-a', run: 'run-2' },
      ),
    ).toMatchObject({
      status: 422,
      body: { message: 'The customer has no instagram conversation to reply in' },
    });
  });
});
