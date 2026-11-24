import type { APIRequestContext, Locator, Page } from '@playwright/test';
import {
  addMessenger,
  type coreClient,
  createChannel,
  expect,
  expectAccessible,
  Id,
  INBOX,
  messengerIn,
  pluginApi,
  test,
  unique,
  visitorOf,
} from './fixtures.ts';

type Api = ReturnType<typeof coreClient>;

/** A one-pixel PNG, to attach an image. */
const PARCEL = {
  name: 'parcel.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
};

/**
 * Attaches four files to the reply: two from the paperclip, which takes several at once, one
 * pasted into the editor and one dropped on it.
 */
const attachFiles = async (page: Page, reply: Locator) => {
  // The paperclip opens the file input behind it.
  await page
    .locator('input[type="file"]')
    .setInputFiles([
      { name: 'receipt.txt', mimeType: 'text/plain', buffer: Buffer.from('paid') },
      PARCEL,
    ]);
  await reply.evaluate((editor) => {
    const data = new DataTransfer();

    data.items.add(new File(['pasted'], 'pasted.txt', { type: 'text/plain' }));
    editor.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  await reply.dispatchEvent('drop', {
    dataTransfer: await page.evaluateHandle(() => {
      const data = new DataTransfer();

      data.items.add(new File(['dropped'], 'dropped.txt', { type: 'text/plain' }));

      return data;
    }),
  });

  for (const name of ['receipt.txt', 'parcel.png', 'pasted.txt', 'dropped.txt'])
    await expect(page.getByRole('button', { name: `Remove ${name}` })).toBeVisible();
};

/**
 * A visitor's question in a new channel, with `memberIds` in it, a response template and a
 * messenger, all made through the API; the template's screens have their own spec.
 */
const askedWithTemplate = async (
  { api, request, plugin }: { api: Api; request: APIRequestContext; plugin: string },
  memberIds: string[] = [],
) => {
  const rpc = await pluginApi(api, request);
  const channel = await rpc('channels/create', { name: `Support ${unique()}`, memberIds }, Id);
  const template = `Refunds ${unique()}`;
  const content = '<p>Refunds take five days.</p>';

  await rpc('responseTemplates/create', { channelId: channel.id, name: template, content }, Id);

  const visitor = await visitorOf(request, plugin, await messengerIn(rpc, {}, channel.id));
  const question = `Can I get a refund ${unique()}`;

  return { template, visitor, question, conversationId: await visitor.write(question) };
};

test('a member answers with a response template, formats it and attaches files', async ({
  page,
  api,
  plugin,
  request,
}) => {
  const { template, visitor, conversationId } = await askedWithTemplate({ api, request, plugin });

  await page.goto(`${INBOX}?conversationId=${conversationId}`);

  const thread = page.getByRole('list', { name: 'Messages' });
  const reply = page.getByRole('textbox', { name: 'Reply' });

  // `/` and the template's name put the template in the reply; bold stays bold in the thread.
  await reply.click();
  await page.keyboard.type(`/${template}`);
  await page.getByRole('button', { name: template, exact: true }).click();
  await expect(reply).toContainText('Refunds take five days.');
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type(' Sorry for the wait.');
  await attachFiles(page, reply);
  // Remove takes a file off the reply before it goes.
  await page.getByRole('button', { name: 'Remove dropped.txt' }).click();
  await expect(page.getByRole('button', { name: 'Remove dropped.txt' })).toBeHidden();
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  const sent = thread.getByRole('article', { name: 'Message' }).last();

  await expect(sent).toContainText('Refunds take five days.');
  await expect(sent.locator('strong')).toHaveText('Sorry for the wait.');
  // An attachment shows only in a thread that has one.
  await expectAccessible(page, sent.getByRole('link', { name: 'receipt.txt' }));
  await expect(sent.getByRole('link', { name: 'dropped.txt' })).toHaveCount(0);

  // An image opens whole over the page.
  await sent.getByRole('button', { name: 'View parcel.png' }).click();
  await expectAccessible(page, page.getByRole('dialog', { name: 'parcel.png' }));
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  // The visitor reads the reply as text.
  expect(await visitor.read(conversationId)).toContain(
    'Refunds take five days. Sorry for the wait.',
  );
});

test('a note mentions a teammate, who finds it under Mentions and gets no templates without the channel permission', async ({
  page,
  api,
  plugin,
  request,
  newMember,
}) => {
  // The teammate answers the inbox but can't read the channel's templates.
  const teammate = await newMember(['frontline.inbox.view']);

  const { template, question, conversationId } = await askedWithTemplate({ api, request, plugin }, [
    teammate.id,
  ]);

  await page.goto(`${INBOX}?conversationId=${conversationId}`);

  const thread = page.getByRole('list', { name: 'Messages' });

  // A note tints the composer and its button reads Add note, so it can't pass for a reply.
  const card = page
    .locator('form')
    .filter({ has: page.getByRole('tab', { name: 'Internal note' }) });

  const replyTint = await card.evaluate((form) => getComputedStyle(form).backgroundColor);

  await page.getByRole('tab', { name: 'Internal note' }).click();
  await expect(page.getByRole('button', { name: 'Add note' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeHidden();
  await expect(card).not.toHaveCSS('background-color', replyTint);

  // It mentions the teammate through `/` and their name, and Ctrl or ⌘ with Enter adds it.
  const note = page.getByRole('textbox', { name: 'Internal note' });

  await expect(note).toBeVisible();

  await note.click();
  await page.keyboard.type(`Please check /${teammate.fullName}`);
  await page.getByRole('button', { name: teammate.fullName, exact: true }).click();
  await expect(note).toContainText(`@${teammate.fullName}`);
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(thread.getByRole('article', { name: 'Internal note' })).toContainText(
    `@${teammate.fullName}`,
  );

  // The teammate finds it under Mentions, and gets no templates without the channel permission.
  const mentions = teammate.page
    .getByRole('list', { name: 'Work queue' })
    .getByRole('link', { name: /^Mentions/ });

  await teammate.page.goto(INBOX);
  await expect(mentions.getByLabel('1 unread')).toBeVisible();
  await mentions.click();

  // The row shows the visitor's question; notes stay out of the list.
  const row = teammate.page
    .getByRole('list', { name: 'Conversations' })
    .getByRole('button', { name: new RegExp(question) });

  await expect(row).not.toContainText('Please check');
  await row.click();
  await teammate.page.getByRole('textbox', { name: 'Reply' }).click();
  await teammate.page.keyboard.type(`/${template}`);
  await expect(teammate.page.getByRole('button', { name: template, exact: true })).toBeHidden();
});

test('a conversation keeps its unsent reply and note apart, through a reload, until each goes', async ({
  page,
  plugin,
  request,
}) => {
  const channel = await createChannel(page);

  await page.goto(INBOX);

  const visitor = await visitorOf(request, plugin, await addMessenger(page, channel));
  const conversationId = await visitor.write(`Where is my parcel ${unique()}`);
  const open = `${INBOX}?conversationId=${conversationId}`;
  const reply = page.getByRole('textbox', { name: 'Reply' });
  const note = page.getByRole('textbox', { name: 'Internal note' });

  await page.goto(open);
  await reply.click();
  await page.keyboard.type('Half a reply');
  // Tab in the editor switches to the note, and Shift+Tab back to the reply.
  await page.keyboard.press('Tab');
  await expect(note).toBeFocused();
  await page.keyboard.type('Half a thought');

  // Another page and a reload later, the note tab comes back with its text, the reply with its own.
  await page.goto(INBOX);
  await expect(page.getByText('Pick a conversation')).toBeVisible();
  await page.goto(open);
  await page.reload();
  await expect(note).toContainText('Half a thought');
  await note.click();
  await page.keyboard.press('Shift+Tab');
  await expect(reply).toContainText('Half a reply');

  // The reply goes and its draft with it; the note's stays.
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Messages' })).toContainText('Half a reply');
  await expect(reply).not.toContainText('Half a reply');
  await page.getByRole('tab', { name: 'Internal note' }).click();
  await expect(note).toContainText('Half a thought');
});

test('a reply answers one message, quoted over the composer and over the reply in the thread', async ({
  page,
  request,
  plugin,
}) => {
  const channel = await createChannel(page);

  await page.goto(INBOX);

  const visitor = await visitorOf(request, plugin, await addMessenger(page, channel));
  const question = `Do you ship to Darkhan ${unique()}`;
  const conversationId = await visitor.write(question);

  await visitor.write('Also, is it free?', conversationId);
  await page.goto(`${INBOX}?conversationId=${conversationId}`);

  const thread = page.getByRole('list', { name: 'Messages' });

  // The reply quotes the question too, so the question is the message that answers none.
  const asked = thread
    .getByRole('article')
    .filter({ hasText: question })
    .filter({ hasNot: page.getByRole('button', { name: /^Go to the message it answers/ }) });

  const quoted = page.getByText(`Replying to: ${question}`);

  // Reply on a message, from the reply tab or the note tab, quotes it in the reply tab.
  await page.getByRole('tab', { name: 'Internal note' }).click();
  await asked.hover();
  await asked.getByRole('button', { name: 'Reply to this message' }).click();
  await expect(quoted).toBeVisible();
  await page.getByRole('button', { name: 'Remove quote' }).click();
  await expect(quoted).toBeHidden();
  await asked.hover();
  await asked.getByRole('button', { name: 'Reply to this message' }).click();
  await page.keyboard.type('Yes, in two days');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(quoted).toBeHidden();

  // The reply carries the quote, which goes to the message it answers.
  const answer = thread.getByRole('article').filter({ hasText: 'Yes, in two days' });

  await answer.getByRole('button', { name: `Go to the message it answers: ${question}` }).click();
  await expect(asked).toHaveAttribute('aria-current', 'true');
});
