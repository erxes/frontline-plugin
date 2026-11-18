import { describe, expect, it, vi } from 'vite-plus/test';
import { JOBS } from '#/core.ts';
import { clientAs } from '#/test/member.ts';
import { asked } from './standIns.ts';
import {
  channelFor,
  FILE_BYTES,
  fakeProviders,
  fixture,
  runJob,
  runQueued,
  serve,
  telegramApi,
  webhookOf,
} from './fakes.ts';
import { asked } from './standIns.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('./standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('./standIns.ts')).sdkStandIn(await importOriginal()),
);

const { deliver } = serve();

/** Telegram's update with the customer's emojis on their message 41. */
const reacted = (emojis: string[], updateId: number) =>
  JSON.stringify({
    update_id: updateId,
    message_reaction: {
      chat: { id: 4242, type: 'private' },
      message_id: 41,
      user: { id: 4242, is_bot: false, first_name: 'Bat' },
      date: 1763180200,
      old_reaction: [],
      new_reaction: emojis.map((emoji) => ({ type: 'emoji', emoji })),
    },
  });

/** Telegram's update with the customer's photo, in two sizes, as their message 50. */
const photoSent = JSON.stringify({
  update_id: 918273010,
  message: {
    message_id: 50,
    from: { id: 4242, is_bot: false, first_name: 'Bat', language_code: 'mn' },
    chat: { id: 4242, first_name: 'Bat', type: 'private' },
    date: 1763180300,
    photo: [
      {
        file_id: 'photo-small',
        file_unique_id: 'AQADsmall',
        file_size: 1290,
        width: 90,
        height: 90,
      },
      { file_id: 'photo-big', file_unique_id: 'AQADbig', file_size: 4, width: 1280, height: 1280 },
    ],
    caption: 'The box came torn',
  },
});

describe('telegram', () => {
  it('connects a bot, takes its updates into a conversation, replies, and stops once its token is revoked', async () => {
    const calls = fakeProviders(telegramApi);
    const owner = clientAs('org-tg-a');

    const account = await owner.integrations.telegram.connect({ token: '777:good-token-abc' });

    expect(account).toMatchObject({
      provider: 'telegram',
      externalId: '777',
      name: '@shop_help_bot',
    });
    expect(account).not.toHaveProperty('secret');

    const { path, signed } = webhookOf(calls);

    await channelFor('org-tg-a', 'telegram', account.id);

    const update = fixture('telegram-update.json');

    expect(await deliver(path, update, { 'x-telegram-bot-api-secret-token': 'forged' })).toBe(401);
    expect(await deliver(path, update)).toBe(401);
    expect(await deliver(path, update, signed)).toBe(200);
    // Telegram sends an update again until it hears 200; the repeat adds nothing.
    expect(await deliver(path, update, signed)).toBe(200);
    expect(await deliver('/telegram/no-such-key', update)).toBe(200);
    expect(await deliver(path, '{not json', signed)).toBe(400);

    const { conversations } = await owner.conversations.list({});

    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      content: 'Hello, is my order on its way?',
      externalId: '4242',
    });
    expect((await clientAs('org-tg-b').conversations.list({})).totalCount).toBe(0);

    const conversationId = conversations[0]?.id ?? '';

    await owner.conversations.messages.create({ conversationId, content: 'It ships today' });
    await runQueued();

    expect(calls.at(-1)?.url.pathname).toBe('/bot777:good-token-abc/sendMessage');
    expect(calls.at(-1)?.body).toEqual({ chat_id: '4242', text: 'It ships today' });

    const { messages } = await owner.conversations.messages.list({ conversationId });

    // Newest first.
    expect(
      messages.map(({ content, deliveryStatus, externalId }) => ({
        content,
        deliveryStatus,
        externalId,
      })),
    ).toEqual([
      { content: 'It ships today', deliveryStatus: 'sent', externalId: '4242:42' },
      { content: 'Hello, is my order on its way?', deliveryStatus: null, externalId: '4242:41' },
    ]);

    // The token was revoked in BotFather. A photo still arrives, without its file; the reply after
    // it fails at once; the bot shows broken, and whoever connected it hears so once.
    const told = asked.notifications.length;

    fakeProviders(() =>
      Response.json({ ok: false, error_code: 401, description: 'Unauthorized' }, { status: 401 }),
    );
    expect(await deliver(path, photoSent, signed)).toBe(200);

    const refused = await owner.conversations.messages.create({ conversationId, content: 'Hi?' });

    await runQueued();

    const after = (await owner.conversations.messages.list({ conversationId })).messages;

    expect(after.find((message) => message.id === refused.id)?.deliveryStatus).toBe('failed');
    expect(after.some((message) => message.content.startsWith('The box came torn'))).toBe(true);
    expect((await owner.integrations.accounts.list({})).accounts).toMatchObject([
      { status: 'broken', error: 'Unauthorized' },
    ]);
    expect(asked.notifications.slice(told)).toMatchObject([
      { title: '@shop_help_bot stopped working', body: 'Unauthorized' },
    ]);
  });

  it("keeps a customer's files in core and sends the files a member attaches", async () => {
    const calls = fakeProviders(telegramApi);
    const owner = clientAs('org-tg-files');
    const account = await owner.integrations.telegram.connect({ token: '777:good-token-abc' });
    const { path, signed } = webhookOf(calls);

    await channelFor('org-tg-files', 'telegram', account.id);
    expect(await deliver(path, photoSent, signed)).toBe(200);

    // The largest size, fetched with the bot's token and kept in core's storage.
    expect(calls.filter((call) => call.url.pathname.endsWith('/getFile'))).toMatchObject([
      { body: { file_id: 'photo-big' } },
    ]);
    expect(calls.at(-1)).toMatchObject({ method: 'PUT', body: FILE_BYTES });

    const [conversation] = (await owner.conversations.list({})).conversations;
    const conversationId = conversation?.id ?? '';
    const [received] = (await owner.conversations.messages.list({ conversationId })).messages;

    const photo = {
      url: '/core/v1/files/file-photo-jpg/download',
      name: 'photo.jpg',
      type: 'image/jpeg',
      size: 4,
    };

    expect(received).toMatchObject({ content: 'The box came torn', attachments: [photo] });

    // Telegram sends it again; the inbox has it, so the file isn't fetched twice.
    const before = calls.length;

    expect(await deliver(path, photoSent, signed)).toBe(200);
    expect(calls.slice(before)).toEqual([]);

    // A reply with the photo goes as a photo, its text the caption.
    await owner.conversations.messages.create({
      conversationId,
      content: 'Sorry, a new one ships today',
      attachments: [photo],
    });
    await runQueued();
    expect(calls.at(-1)?.url.pathname).toBe('/bot777:good-token-abc/sendPhoto');
    expect(calls.at(-1)?.body).toEqual({
      chat_id: '4242',
      photo: { name: 'photo.jpg', type: 'image/jpeg', size: 4 },
      caption: 'Sorry, a new one ships today',
    });

    // A file that isn't in core's storage isn't taken, so no reply goes without it.
    await expect(
      owner.conversations.messages.create({
        conversationId,
        content: 'Here is the label',
        attachments: [{ url: 'https://elsewhere.example/label.pdf', name: 'label.pdf' }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // Text too long for a caption goes first; Telegram refuses the file after it. The next attempt
    // sends only the file, so the customer doesn't get the text again.
    const partly = await owner.conversations.messages.create({
      conversationId,
      content: 'Long instructions. '.repeat(60),
      attachments: [{ url: '/core/v1/files/file-refused/download', name: 'refused.txt' }],
    });

    const job = { orgId: 'org-tg-files', name: JOBS.send.name, payload: { messageId: partly.id } };

    asked.jobs.length = 0;
    await expect(runJob(job, 1)).rejects.toThrow('wrong file type');
    await expect(runJob(job, 2)).rejects.toThrow('wrong file type');
    expect(calls.slice(-3).map(({ url }) => url.pathname.split('/').at(-1))).toEqual([
      'sendMessage',
      'sendDocument',
      'sendDocument',
    ]);
  });

  it('reads a sticker as its emoji and keeps its picture', async () => {
    const calls = fakeProviders(telegramApi);
    const owner = clientAs('org-tg-sticker');
    const account = await owner.integrations.telegram.connect({ token: '777:good-token-abc' });
    const { path, signed } = webhookOf(calls);

    await channelFor('org-tg-sticker', 'telegram', account.id);

    const sticker = fixture('telegram-update.json').replace(
      '"text": "Hello, is my order on its way?"',
      '"sticker": { "file_id": "sticker-1", "file_unique_id": "AgADst", "type": "regular", "width": 512, "height": 512, "is_animated": false, "is_video": false, "emoji": "😀", "set_name": "Animals" }',
    );

    expect(await deliver(path, sticker, signed)).toBe(200);

    const [conversation] = (await owner.conversations.list({})).conversations;

    const [received] = (
      await owner.conversations.messages.list({ conversationId: conversation?.id ?? '' })
    ).messages;

    expect(received).toMatchObject({
      content: 'Sticker 😀',
      attachments: [{ name: 'sticker.webp', type: 'image/webp' }],
    });
  });

  it('skips a message the inbox cannot store, so Telegram stops sending it', async () => {
    const calls = fakeProviders(telegramApi);
    const owner = clientAs('org-tg-nul');
    const account = await owner.integrations.telegram.connect({ token: '777:good-token-abc' });
    const { path, signed } = webhookOf(calls);

    await channelFor('org-tg-nul', 'telegram', account.id);

    // Postgres refuses text with a NUL byte, every time.
    const update = fixture('telegram-update.json').replace(
      'Hello, is my order on its way?',
      'Half\\u0000a message',
    );

    expect(await deliver(path, update, signed)).toBe(200);
    expect((await owner.conversations.list({})).totalCount).toBe(0);
  });

  it("reacts to a customer's message through the bot and keeps the customer's reactions", async () => {
    const calls = fakeProviders(telegramApi);
    const owner = clientAs('org-tg-react');
    const account = await owner.integrations.telegram.connect({ token: '777:good-token-abc' });
    const { path, signed } = webhookOf(calls);

    await channelFor('org-tg-react', 'telegram', account.id);
    expect(await deliver(path, fixture('telegram-update.json'), signed)).toBe(200);

    const [conversation] = (await owner.conversations.list({})).conversations;
    const conversationId = conversation?.id ?? '';
    const [message] = (await owner.conversations.messages.list({ conversationId })).messages;
    const id = message?.id ?? '';

    await expect(owner.conversations.messages.react({ id, emoji: '❤️' })).resolves.toEqual({
      reactions: [{ emoji: '❤️', count: 1, mine: true }],
    });
    // One bot, one reaction: Telegram's emoji has no U+FE0F.
    expect(calls.at(-1)?.url.pathname).toBe('/bot777:good-token-abc/setMessageReaction');
    expect(calls.at(-1)?.body).toEqual({
      chat_id: '4242',
      message_id: 41,
      reaction: [{ type: 'emoji', emoji: '❤' }],
    });

    await owner.conversations.messages.react({ id, emoji: '❤️', remove: true });
    expect(calls.at(-1)?.body).toMatchObject({ reaction: [] });
    await expect(owner.conversations.messages.react({ id, emoji: 'nope' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });

    // The customer's own reactions replace theirs each time Telegram reports them.
    expect(await deliver(path, reacted(['👍', '🔥'], 918273002), signed)).toBe(200);
    expect(await deliver(path, reacted(['👍'], 918273003), signed)).toBe(200);

    const [shown] = (await owner.conversations.messages.list({ conversationId })).messages;

    expect(shown?.reactions).toEqual([{ emoji: '👍', count: 1, mine: false }]);
  });

  it('refuses a token Telegram refuses', async () => {
    fakeProviders(telegramApi);

    await expect(
      clientAs('org-tg-c').integrations.telegram.connect({ token: '1:bad-token-xyz' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Telegram refused the token: Unauthorized',
    });
  });
});
