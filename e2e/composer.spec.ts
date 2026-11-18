import type { Locator, Page } from '@playwright/test';
import {
  addMessenger,
  createChannel,
  expect,
  expectAccessible,
  INBOX,
  recordPanel,
  test,
  unique,
  visitorOf,
} from './fixtures.ts';

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

test('a member answers with a response template, formats it, attaches a file and mentions a teammate in a note', async ({
  page,
  request,
  newMember,
}) => {
  // The teammate answers the inbox but can't read the channel's templates.
  const teammate = await newMember(['frontline.inbox.view']);
  const channel = await createChannel(page, teammate.fullName);
  const panel = recordPanel(page);
  const template = `Refunds ${unique()}`;

  await panel.getByRole('link', { name: /Manage channel response templates/ }).click();
  await page.getByRole('button', { name: 'Create response template' }).first().click();
  await panel.getByLabel('Name').fill(template);
  await panel.getByRole('textbox', { name: 'Content' }).fill('Refunds take five days.');
  await panel.getByRole('button', { name: 'Create response template' }).click();
  await expect(page.getByRole('row', { name: new RegExp(template) })).toBeVisible();

  await page.goto(INBOX);

  const visitor = await visitorOf(request, await addMessenger(page, channel));
  const question = `Can I get a refund ${unique()}`;
  const conversationId = await visitor.write(question);

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
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  const sent = thread.getByRole('article', { name: 'Message' }).last();

  await expect(sent).toContainText('Refunds take five days.');
  await expect(sent.locator('strong')).toHaveText('Sorry for the wait.');
  // An attachment shows only in a thread that has one.
  await expectAccessible(page, sent.getByRole('link', { name: 'receipt.txt' }));

  // An image opens whole over the page.
  await sent.getByRole('button', { name: 'View parcel.png' }).click();
  await expectAccessible(page, page.getByRole('dialog', { name: 'parcel.png' }));
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  // The visitor reads the reply as text.
  expect(await visitor.read(conversationId)).toContain(
    'Refunds take five days. Sorry for the wait.',
  );

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
  // The row shows the conversation's last reply; notes stay out of the list.
  await teammate.page
    .getByRole('list', { name: 'Conversations' })
    .getByRole('button', { name: /Sorry for the wait/ })
    .click();
  await teammate.page.getByRole('textbox', { name: 'Reply' }).click();
  await teammate.page.keyboard.type(`/${template}`);
  await expect(teammate.page.getByRole('button', { name: template, exact: true })).toBeHidden();
});

test('a conversation keeps its unsent reply and note apart, through a reload, until each goes', async ({
  page,
  request,
}) => {
  const channel = await createChannel(page);

  await page.goto(INBOX);

  const visitor = await visitorOf(request, await addMessenger(page, channel));
  const conversationId = await visitor.write(`Where is my parcel ${unique()}`);
  const open = `${INBOX}?conversationId=${conversationId}`;
  const reply = page.getByRole('textbox', { name: 'Reply' });
  const note = page.getByRole('textbox', { name: 'Internal note' });

  await page.goto(open);
  await reply.click();
  await page.keyboard.type('Half a reply');
  await page.getByRole('tab', { name: 'Internal note' }).click();
  await note.click();
  await page.keyboard.type('Half a thought');

  // Another page and a reload later, the note tab comes back with its text, the reply with its own.
  await page.goto(INBOX);
  await expect(page.getByText('Pick a conversation')).toBeVisible();
  await page.goto(open);
  await page.reload();
  await expect(note).toContainText('Half a thought');
  await page.getByRole('tab', { name: 'Reply' }).click();
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
}) => {
  const channel = await createChannel(page);

  await page.goto(INBOX);

  const visitor = await visitorOf(request, await addMessenger(page, channel));
  const question = `Do you ship to Darkhan ${unique()}`;
  const conversationId = await visitor.write(question);

  await visitor.write('Also, is it free?', conversationId);
  await page.goto(`${INBOX}?conversationId=${conversationId}`);

  const thread = page.getByRole('list', { name: 'Messages' });
  const asked = thread.getByRole('article').filter({ hasText: question });
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
