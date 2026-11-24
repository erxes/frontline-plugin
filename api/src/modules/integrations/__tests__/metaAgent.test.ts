import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { SEND_ATTEMPTS } from '#/core.ts';
import { asked } from './standIns.ts';
import {
  channelFor,
  conversationWith,
  fakeProviders,
  fixture,
  graphApi,
  type ProviderCall,
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

const { connectMeta, deliver, coreEvent } = serve();

/** A delivery of Messenger's or Instagram's messaging `events` for the page or account `id`. */
const messaging = (object: 'page' | 'instagram', id: string, events: unknown[]) => {
  const raw = JSON.stringify({ object, entry: [{ id, time: 1763180000123, messaging: events }] });

  return deliver('/meta', raw, signedByMeta(raw));
};

/** `sender`'s message `mid` to `recipient`, with what else Meta put in `message`. */
const said = (
  sender: string,
  recipient: string,
  mid: string,
  message: Record<string, unknown>,
) => ({
  sender: { id: sender },
  recipient: { id: recipient },
  timestamp: 1763180000500,
  message: { mid, ...message },
});

/** `orgId`'s page or Instagram account, answered by core's `agent-1`. */
const withAgent = async (orgId: string, provider: 'facebook' | 'instagram') => {
  const { owner, integration } = await connectMeta(orgId, provider);

  await owner.integrations.setAgent({ id: integration.id, agentId: 'agent-1' });

  return owner;
};

/** Core's agent answers in conversation `key` with `answer` and the blocks it showed. */
const answered = (orgId: string, eventId: string, key: string, answer: string, blocks: object[]) =>
  coreEvent(orgId, eventId, 'core.agent.finished', {
    agentId: 'agent-1',
    plugin: 'frontline',
    key,
    answer,
    blocks,
  });

const Sent = z.object({ message: z.record(z.string(), z.unknown()) });

/** What each message the page sent through Meta said, oldest first. */
const sentToMeta = (calls: ProviderCall[]) =>
  calls
    .filter((call) => call.method === 'POST' && call.url.pathname.endsWith('/me/messages'))
    .map((call) => Sent.parse(call.body).message);

/** What the agent gave core in conversation `key`. */
const agentGot = (key: string) => asked.submitted.filter((each) => each.key === key);

const template = (payload: Record<string, unknown>) => ({
  attachment: { type: 'template', payload },
});

describe('a page’s core agent', () => {
  it('gets the customer’s own text, and answers it with each block in Meta’s own form', async () => {
    const calls = fakeProviders(graphApi);
    const owner = await withAgent('org-fb-agent-a', 'facebook');
    // A text, a photo and the page's echo; then a quick reply, a tapped button and a reaction.
    const raw = fixture('meta-delivery.json');

    await deliver('/meta', raw, signedByMeta(raw));
    await deliver('/meta', raw, signedByMeta(raw));
    await messaging('page', 'page-1', [
      said('psid-1', 'page-1', 'm_quick', { text: 'Size 40', quick_reply: { payload: 'SIZE_40' } }),
      { ...said('psid-1', 'page-1', 'm_tap', {}), message: undefined, postback: { title: 'Menu' } },
      {
        ...said('psid-1', 'page-1', 'm_x', {}),
        message: undefined,
        reaction: { mid: 'm_first', action: 'react', emoji: '❤' },
      },
    ]);
    await runQueued();

    const id = await conversationWith('org-fb-agent-a', 'psid-1');
    const { customerId } = await owner.conversations.get({ id });
    const { messages } = await owner.conversations.messages.list({ conversationId: id });

    // Once, though Meta delivered it twice.
    expect(agentGot(id)).toEqual([
      {
        id: 'agent-1',
        key: id,
        text: 'Do you ship to Darkhan?',
        requestId: messages.find((message) => message.externalId === 'm_first')?.id,
        customerId,
      },
    ]);

    const boots = {
      kind: 'product',
      title: 'Felt boots',
      price: '450,000₮',
      text: 'Handmade in Arkhangai.',
      imageUrl: 'https://shop.example.com/boots.jpg',
      url: 'https://shop.example.com/boots',
    };

    const shown = [
      { kind: 'image', url: 'https://shop.example.com/shop.jpg', alt: 'Our shop' },
      boots,
      { kind: 'link', title: 'Size guide', url: 'https://shop.example.com/sizes' },
      { kind: 'product', title: 'Wool socks', price: '35,000₮' },
      {
        kind: 'payment',
        title: 'Your order',
        url: 'https://pay.example.com/i/1',
        amount: '485,000₮',
      },
    ];

    expect(await answered('org-fb-agent-a', 'ev-fb-a', id, 'We do.', shown)).toBe(204);
    await runQueued();
    // Core may deliver an event again, after the answer went.
    await answered('org-fb-agent-a', 'ev-fb-a', id, 'We do.', shown);
    await runQueued();

    const view = { type: 'web_url', url: boots.url, title: 'View' };

    expect(sentToMeta(calls)).toEqual([
      { text: 'We do.' },
      { attachment: { type: 'image', payload: { url: 'https://shop.example.com/shop.jpg' } } },
      template({
        template_type: 'generic',
        elements: [
          {
            title: 'Felt boots',
            subtitle: '450,000₮ · Handmade in Arkhangai.',
            image_url: boots.imageUrl,
            default_action: { type: 'web_url', url: boots.url },
            buttons: [view],
          },
          { title: 'Wool socks', subtitle: '35,000₮' },
        ],
      }),
      template({
        template_type: 'button',
        text: 'Size guide',
        buttons: [{ type: 'web_url', url: 'https://shop.example.com/sizes', title: 'Open' }],
      }),
      template({
        template_type: 'button',
        text: 'Your order · 485,000₮',
        buttons: [{ type: 'web_url', url: 'https://pay.example.com/i/1', title: 'Pay' }],
      }),
    ]);

    // A member's reply stops the bot: the next message waits for them.
    await owner.conversations.messages.create({ conversationId: id, content: 'I can help.' });
    await runQueued();
    await messaging('page', 'page-1', [said('psid-1', 'page-1', 'm_later', { text: 'Thanks!' })]);
    expect(agentGot(id)).toHaveLength(1);

    // An agent answers no comments, and no kind of integration but these.
    const comments = fixture('meta-feed.json');

    await deliver('/meta', comments, signedByMeta(comments));
    expect(
      agentGot(await conversationWith('org-fb-agent-a', 'comment:page-1_post-9:asid-7')),
    ).toEqual([]);

    const telegram = await channelFor('org-fb-agent-a', 'telegram', 'account-tg');

    await expect(
      owner.integrations.setAgent({ id: telegram.id, agentId: 'agent-1' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('sends the answer’s markdown as plain text, and a block Instagram refuses as text with its link', async () => {
    // Instagram shows no WebP picture.
    const calls = fakeProviders((call) =>
      /"type":"image".*\.webp/.test(JSON.stringify(call.body))
        ? Response.json({ error: { message: 'Invalid image' } }, { status: 400 })
        : graphApi(call),
    );

    const owner = await withAgent('org-ig-agent-a', 'instagram');

    await messaging('instagram', 'ig-1', [said('igsid-6', 'ig-1', 'ig_m_ask', { text: 'Boots?' })]);

    const id = await conversationWith('org-ig-agent-a', 'igsid-6');
    const picture = 'https://shop.example.com/boots.webp';

    expect(agentGot(id).map(({ text }) => text)).toEqual(['Boots?']);

    const answer = [
      '### Felt boots',
      '**Yes**, in _two_ sizes:',
      '- 39\n- 40',
      '1. Pick a size\n2. Pay at [our shop](https://shop.example.com/pay)',
      'Use `BOOTS10` at [https://shop.example.com](https://shop.example.com).',
    ].join('\n\n');

    await answered('org-ig-agent-a', 'ev-ig-a', id, answer, [
      { kind: 'image', url: picture, alt: 'Felt boots' },
      { kind: 'link', title: 'Size guide', url: 'https://shop.example.com/sizes' },
    ]);
    await runQueued();

    // The inbox and the website messenger keep the markdown; Meta gets the text it reads as.
    const { messages } = await owner.conversations.messages.list({ conversationId: id });

    expect(messages.map(({ content }) => content)).toContain(answer);
    expect(sentToMeta(calls)).toEqual([
      {
        text: [
          'Felt boots',
          'Yes, in two sizes:',
          '• 39\n• 40',
          '1. Pick a size\n2. Pay at our shop: https://shop.example.com/pay',
          'Use BOOTS10 at https://shop.example.com.',
        ].join('\n\n'),
      },
      { attachment: { type: 'image', payload: { url: picture } } },
      { text: `Felt boots\n${picture}` },
      template({
        template_type: 'button',
        text: 'Size guide',
        buttons: [{ type: 'web_url', url: 'https://shop.example.com/sizes', title: 'Open' }],
      }),
    ]);
  });

  it('gives the conversation to a person when the agent hands off, telling the customer once', async () => {
    const calls = fakeProviders(graphApi);
    const owner = await withAgent('org-fb-agent-c', 'facebook');

    await messaging('page', 'page-1', [said('psid-1', 'page-1', 'm_refund', { text: 'Refund?' })]);
    await runQueued();

    const id = await conversationWith('org-fb-agent-c', 'psid-1');

    const handedOff = () =>
      coreEvent('org-fb-agent-c', 'ev-fb-h2', 'core.agent.handed_off', {
        agentId: 'agent-1',
        plugin: 'frontline',
        key: id,
        reason: 'Refunds need a person',
      });

    await answered('org-fb-agent-c', 'ev-fb-h1', id, 'A person will answer you shortly.', []);
    await handedOff();
    await handedOff();
    await runQueued();

    expect(await owner.conversations.get({ id })).toMatchObject({ operator: 'person' });
    expect(sentToMeta(calls)).toEqual([{ text: 'A person will answer you shortly.' }]);
    expect(
      (await owner.conversations.messages.list({ conversationId: id })).messages
        .filter((message) => message.internal)
        .map(({ content }) => content),
    ).toEqual(['The agent handed this conversation to a person: Refunds need a person']);
  });

  it('hands the conversation to a person when core refuses, the agent fails or Meta never takes the answer', async () => {
    let calls = fakeProviders(graphApi);
    const owner = await withAgent('org-fb-agent-b', 'facebook');
    const handOff = { text: 'A person from the team will answer you here.' };

    const operatorOf = async (sender: string) =>
      (await owner.conversations.get({ id: await conversationWith('org-fb-agent-b', sender) }))
        .operator;

    await messaging('page', 'page-1', [
      said('psid-1', 'page-1', 'm_busy', { text: asked.refusedByAgent }),
      said('psid-2', 'page-1', 'm_ask', { text: 'Do you ship?' }),
      said('psid-3', 'page-1', 'm_size', { text: 'Size 40?' }),
    ]);
    await runQueued();

    expect(await operatorOf('psid-1')).toBe('person');
    expect(sentToMeta(calls)).toEqual([handOff]);

    const failing = await conversationWith('org-fb-agent-b', 'psid-2');

    await coreEvent('org-fb-agent-b', 'ev-fb-b', 'core.agent.failed', {
      agentId: 'agent-1',
      plugin: 'frontline',
      key: failing,
      reason: 'The model refused',
    });
    expect(await operatorOf('psid-2')).toBe('person');

    // Meta refuses every message to psid-3, on every attempt.
    calls = fakeProviders((call) =>
      JSON.stringify(call.body).includes('psid-3')
        ? Response.json({ error: { message: 'Invalid parameter' } }, { status: 400 })
        : graphApi(call),
    );

    const unsent = await conversationWith('org-fb-agent-b', 'psid-3');

    await answered('org-fb-agent-b', 'ev-fb-c', unsent, 'Yes, size 40 is in.', []);
    await expect(runQueued(SEND_ATTEMPTS)).rejects.toThrow('Invalid parameter');

    expect(await operatorOf('psid-3')).toBe('person');
    expect(
      (await owner.conversations.messages.list({ conversationId: unsent })).messages.map(
        ({ content, deliveryStatus }) => ({ content, deliveryStatus }),
      ),
    ).toEqual([
      { content: handOff.text, deliveryStatus: 'queued' },
      { content: 'Yes, size 40 is in.', deliveryStatus: 'failed' },
      { content: 'Size 40?', deliveryStatus: null },
    ]);
    // psid-2 hears that a person took over; Meta refused the answer to psid-3. The two queued
    // sends run at once, so their order varies.
    const sent = sentToMeta(calls);

    expect(sent).toHaveLength(2);
    expect(sent).toEqual(expect.arrayContaining([handOff, { text: 'Yes, size 40 is in.' }]));
  });
});
