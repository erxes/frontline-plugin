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

  // axe runs on each editor before its `/` menu opens: the menu leaves `aria-expanded` on the
  // textbox (https://github.com/erxes/erxes/issues/10611). A send starts a fresh editor.
  await expect(reply).toBeVisible();
  await expectAccessible(page);

  // `/` and the template's name put the template in the reply; bold stays bold in the thread.
  await reply.click();
  await page.keyboard.type(`/${template}`);
  await page.getByRole('button', { name: template, exact: true }).click();
  await expect(reply).toContainText('Refunds take five days.');
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type(' Sorry for the wait.');
  await page
    .getByLabel('Attach file')
    .setInputFiles({ name: 'receipt.txt', mimeType: 'text/plain', buffer: Buffer.from('paid') });
  await expect(page.getByRole('button', { name: 'Remove receipt.txt' })).toBeVisible();
  await page.getByRole('button', { name: 'Send' }).click();

  const sent = thread.getByRole('listitem', { name: 'Message' }).last();

  await expect(sent).toContainText('Refunds take five days.');
  await expect(sent.locator('strong')).toHaveText('Sorry for the wait.');
  await expect(sent.getByRole('link', { name: 'receipt.txt' })).toBeVisible();
  await expectAccessible(page);

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
  await expect(page.getByRole('button', { name: 'Send' })).toBeHidden();
  await expect(card).not.toHaveCSS('background-color', replyTint);

  // It mentions the teammate through `/` and their name, and Ctrl or ⌘ with Enter adds it.
  const note = page.getByRole('textbox', { name: 'Internal note' });

  await expect(note).toBeVisible();
  await expectAccessible(page);
  await note.click();
  await page.keyboard.type(`Please check /${teammate.fullName}`);
  await page.getByRole('button', { name: teammate.fullName, exact: true }).click();
  await expect(note).toContainText(`@${teammate.fullName}`);
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(thread.getByRole('listitem', { name: 'Internal note' })).toContainText(
    `@${teammate.fullName}`,
  );
  await expectAccessible(page);

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
