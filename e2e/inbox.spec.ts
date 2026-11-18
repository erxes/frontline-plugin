import { createHmac } from 'node:crypto';
import type { Locator } from '@playwright/test';
import {
  addMessenger,
  createChannel,
  expect,
  expectAccessible,
  filterBy,
  INBOX,
  MESSENGER,
  openMessenger,
  OWNER,
  pick,
  recordPanel,
  test,
  unique,
  visitorOf,
} from './fixtures.ts';

/** Where a control starts from the left of the page, to check the order of a row. */
const left = async (control: Locator) => (await control.boundingBox())?.x ?? Number.NaN;

test('a visitor writes through the messenger and a member answers, assigns, tags, pins and resolves it', async ({
  page,
  request,
}) => {
  const channel = await createChannel(page);
  const late = `My order ${unique()} is late`;
  const tag = `Shipping ${unique()}`;

  // Frontline opens on its inbox.
  await page.goto('/frontline');
  await expect(page).toHaveURL(new RegExp(`${INBOX}$`));

  const visitor = await visitorOf(request, await addMessenger(page, channel));
  const conversationId = await visitor.write(late);

  await page.goto(INBOX);

  const conversations = page.getByRole('list', { name: 'Conversations' });
  const thread = page.getByRole('list', { name: 'Messages' });

  // A row names the integration the conversation came through, beside the customer and the preview.
  const lateRow = conversations.getByRole('button', { name: new RegExp(late) });

  await expect(lateRow).toContainText(/Website \S+/);
  await lateRow.click();
  await expect(thread.getByRole('article', { name: 'Message' })).toContainText(late);

  // A reply reaches the visitor; an internal note stays with the team.
  await page.getByRole('textbox', { name: 'Reply' }).fill('It ships today.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(thread).toContainText('It ships today.');
  await page.getByRole('tab', { name: 'Internal note' }).click();
  await page.getByRole('textbox', { name: 'Internal note' }).fill('Courier confirmed.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(thread.getByRole('article', { name: 'Internal note' })).toContainText(
    'Courier confirmed.',
  );

  expect(await visitor.read(conversationId)).toEqual([late, 'It ships today.']);

  // The visitor's next message shows in the open thread and the list's preview without a reload.
  const thanks = `Thanks ${unique()}`;
  const row = conversations.getByRole('button', { name: new RegExp(thanks) });

  await visitor.write(thanks, conversationId);
  await expect(thread).toContainText(thanks);
  await expect(row).toHaveAttribute('aria-current', 'true');

  // Assign it, tag it with a tag made in the picker, and pin its first message above the thread.
  const fullName = `${OWNER.firstName} ${OWNER.lastName}`;
  const header = page.getByRole('region', { name: 'Conversation' }).locator('header');

  await header.getByRole('button', { name: 'Assign', exact: true }).click();
  await page.getByRole('option', { name: fullName }).click();
  await expect(header.getByRole('button', { name: fullName })).toBeVisible();
  await page.getByRole('button', { name: 'Add tags' }).click();
  await page.getByPlaceholder('Search tags').fill(tag);
  await page.getByRole('button', { name: `Create tag: ${tag}` }).click();
  await page.keyboard.press('Escape');
  await expect(header).toContainText(tag);

  // The header is one row, as the old inbox's was: the assignee, then the tags, then Resolve.
  // The assignee's button holds more than their name, and the tags' button names its tags after
  // Edit tags, so both match by part of their names.
  const assignee = header.getByRole('button', { name: fullName });
  const tags = header.getByRole('button', { name: /^Edit tags/ });
  const resolve = header.getByRole('button', { name: 'Resolve', exact: true });

  expect(await left(assignee)).toBeLessThan(await left(tags));
  expect(await left(tags)).toBeLessThan(await left(resolve));

  const first = thread.getByRole('article', { name: 'Message' }).first();

  await first.hover();
  await first.getByRole('button', { name: 'Pin' }).click();

  const pinned = page.getByRole('region', { name: 'Pinned messages' });

  await expect(pinned).toContainText(late);
  // The bar goes to the message, and unpins it.
  await pinned.getByRole('button', { name: new RegExp(late) }).click();
  await expect(first).toBeInViewport();
  await pinned.getByRole('button', { name: 'Unpin' }).click();
  await expect(pinned).toBeHidden();

  // The filters find it by its channel, assignee and tag.
  await filterBy(page, 'Channel', channel);
  await filterBy(page, 'Assignee', fullName);
  await filterBy(page, 'Tags', tag);
  await expect(conversations.getByRole('listitem')).toHaveCount(1);
  await expect(row).toBeVisible();

  // Resolved conversations leave the list until the status filter asks for them.
  await page.getByRole('button', { name: 'Resolve', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reopen', exact: true })).toBeVisible();
  await page.reload();
  await expect(row).toBeHidden();
  await filterBy(page, 'Status', 'Resolved');
  await expect(row).toBeVisible();
  await page.getByRole('button', { name: 'Reopen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resolve', exact: true })).toBeVisible();
});

test('the thread follows new messages at its end, and counts them for a reader up in the history', async ({
  page,
  request,
}) => {
  const channel = await createChannel(page);

  await page.goto(INBOX);

  const visitor = await visitorOf(request, await addMessenger(page, channel));
  const conversationId = await visitor.write(`Hello ${unique()}`);
  const thread = page.getByRole('list', { name: 'Messages' });

  await page.goto(`${INBOX}?conversationId=${conversationId}`);
  await expect(thread).toBeVisible();
  await Promise.all(
    Array.from({ length: 20 }, (_, line) => visitor.write(`Line ${line}`, conversationId)),
  );

  const filler = `Last line ${unique()}`;

  await visitor.write(filler, conversationId);
  await expect(thread.getByText(filler)).toBeInViewport();
  await thread.hover();
  await page.mouse.wheel(0, -10_000);

  const below = `Below ${unique()}`;
  const newer = page.getByRole('button', { name: '1 new message' });

  await visitor.write(below, conversationId);
  await newer.click();
  await expect(thread.getByText(below)).toBeInViewport();
  await expect(newer).toHaveCount(0);
});

test('an admin sets up the messenger on its settings page and visitors get it', async ({
  page,
  request,
  newMember,
}) => {
  const channel = await createChannel(page);
  const title = `Hello from ${unique()}`;

  await page.goto(INBOX);

  const key = await addMessenger(page, channel);
  const settingsUrl = page.url();
  const panel = recordPanel(page);

  // The channel's panel lists the messenger with a link to its settings.
  await page.goto('/frontline/settings/channels');
  await page.getByText(channel, { exact: true }).click();
  await panel.getByRole('link', { name: /^Settings of Website / }).click();
  await expect(page).toHaveURL(settingsUrl);

  // Archived, it takes no visitors until an admin unarchives it.
  await page.goto(`${INBOX}?panel=/detail/frontline:integration/${settingsUrl.split('/').pop()}`);
  await panel.getByRole('button', { name: 'Integration actions' }).click();
  await page.getByRole('option', { name: 'Archive' }).click();
  await expect(panel.getByText('Archived', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Integration actions' }).click();
  await page.getByRole('option', { name: 'Unarchive' }).click();
  await expect(panel.getByText('Active', { exact: true })).toBeVisible();

  // The messenger's own panel leads back to the settings page too.
  await panel.getByRole('link', { name: 'Look, hours and install code' }).click();
  await expect(page).toHaveURL(settingsUrl);
  await expect(page.getByRole('textbox', { name: 'Welcome message' })).toHaveValue(
    'Hi, how can we help?',
  );
  await expect(page.getByText(`/widget/messenger.js?key=${key}"></script>`)).toBeVisible();

  // The secret the website signs visitors with: made, then rotated after a confirm.
  const secret = page.getByLabel('Messenger identity secret');

  await page.getByRole('button', { name: 'Make a secret' }).click();
  await expect(secret).toHaveText(/^[\w-]{43}$/);

  const first = await secret.textContent();

  await page.getByRole('button', { name: 'Rotate secret' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Rotate secret' }).click();
  await expect(secret).not.toHaveText(first ?? '');

  // Each change shows in the preview before it saves.
  const preview = page.getByLabel('Preview');

  await page.getByRole('textbox', { name: 'Greeting title' }).fill(title);
  await expect(preview).toContainText(title);
  await page.getByRole('button', { name: 'Teal', exact: true }).click();
  await pick(page, page.getByRole('combobox', { name: 'Set availability' }), 'By online hours');
  await page.getByRole('button', { name: 'Add hours' }).click();
  await page.getByRole('switch', { name: 'Ask for an email or phone' }).click();
  await page.getByRole('textbox', { name: 'Bot greeting' }).fill('I am the bot. Ask me anything.');
  await expect(preview).toContainText('I am the bot.');
  // Online hours and the bot's fields show only once switched on.
  await expectAccessible(page, page.getByRole('button', { name: 'Add hours' }));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Messenger saved')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Greeting title' })).toHaveValue(title);
  await expect(page.getByRole('combobox', { name: 'Set availability' })).toContainText(
    'By online hours',
  );

  const connected = await request.post(`${MESSENGER}/connect`, { data: { key } });

  expect(await connected.json()).toMatchObject({
    messenger: { greetingTitle: title, color: '#0F766E', requireAuth: true },
  });

  // A visitor the shop signs in writes at once, though the messenger asks others for an email.
  const email = `${unique()}@e2e.test`;

  const hash = createHmac('sha256', (await secret.textContent()) ?? '')
    .update(email)
    .digest('hex');

  await using site = await openMessenger(
    page.context(),
    key,
    `<script>window.frontlineMessenger = { email: '${email}', hash: '${hash}' };</script>`,
  );

  await site.panel.getByRole('button', { name: 'Send us a message' }).click();
  await expect(site.panel.getByRole('textbox', { name: 'Message' })).toBeVisible();
  await expect(site.panel).not.toContainText('Leave your email or phone number');

  // A member outside the messenger's channel doesn't find it.
  const outsider = await newMember(['frontline.channel.view']);

  await outsider.page.goto(new URL(page.url()).pathname);
  await expect(outsider.page.getByRole('alert')).toContainText('No such integration');
  await expectAccessible(outsider.page, outsider.page.getByRole('alert'));
});

test('a visitor writes from the widget on a phone, keeps a draft and reads the reply in view', async ({
  page,
}) => {
  const channel = await createChannel(page);
  const question = `Do you ship ${unique()} abroad?`;

  await page.goto(INBOX);

  await using site = await openMessenger(page.context(), await addMessenger(page, channel));
  const { panel } = site;

  const message = panel.getByRole('textbox', { name: 'Message' });

  // On a phone the panel fills the screen. The launcher steps aside so Send takes the tap, and
  // each message the visitor sends lands in view.
  await site.shop.setViewportSize({ width: 390, height: 844 });
  await panel.getByRole('button', { name: 'Send us a message' }).click();
  await expect(panel).toContainText('Hi, how can we help?');

  for (const line of Array.from({ length: 14 }, (_, n) => `Line ${n + 1} of my question`)) {
    await message.fill(line);
    await panel.getByRole('button', { name: 'Send' }).click();
    await expect(panel.getByText(line, { exact: true })).toBeInViewport();
  }

  await message.fill(question);
  await panel.getByRole('button', { name: 'Send' }).click();
  await expect(panel.getByText(question)).toBeInViewport();

  // Closing the panel keeps what the visitor was writing.
  await message.fill('Half a thought');
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(panel).toBeHidden();
  await site.shop.getByRole('button', { name: 'Open the messenger' }).click();
  await expect(message).toHaveValue('Half a thought');

  await page.goto(INBOX);
  await page
    .getByRole('list', { name: 'Conversations' })
    .getByRole('button', { name: new RegExp(question.replace('?', '\\?')) })
    .click();
  await page.getByRole('textbox', { name: 'Reply' }).fill('Yes, to 40 countries.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  // The stream tells the widget; it refetches the open conversation and shows the reply.
  await expect(panel.getByText('Yes, to 40 countries.')).toBeInViewport();
});

test('a member takes over from the bot, sees the visitor typing and edits a reply', async ({
  page,
  request,
}) => {
  const channel = await createChannel(page);
  const question = `Where is parcel ${unique()}?`;

  await page.goto(INBOX);

  const visitor = await visitorOf(request, await addMessenger(page, channel));
  const conversationId = await visitor.write(question);

  await page.goto(INBOX);
  await expect(page.getByRole('link', { name: /^Inbox \d+ unread$/ })).toBeVisible();
  await page
    .getByRole('list', { name: 'Conversations' })
    .getByRole('button', { name: new RegExp(question.replace('?', '\\?')) })
    .click();

  const thread = page.getByRole('list', { name: 'Messages' });
  const header = page.getByRole('region', { name: 'Conversation' }).locator('header');
  const presence = page.getByLabel('Visitor presence');

  // The visitor's presence is a line in the customer panel, which the rail opens; typing shows
  // beside their name.
  await page
    .getByRole('toolbar', { name: 'Customer panels' })
    .getByRole('button', { name: 'Customer', exact: true })
    .click();
  await expect(presence).toContainText('1 visit');
  await visitor.tell(conversationId, 'typing');
  await expect(header).toContainText('Typing…');

  // The visitor asks for a person: the bot says one will answer, and the member can hand it back
  // from the header's overflow menu.
  const actions = header.getByRole('button', { name: 'Conversation actions' });

  await visitor.tell(conversationId, 'person');
  await expect(thread).toContainText('A person from the team will answer you here.');
  await expect(thread.getByRole('article', { name: 'Message' }).last()).toContainText('Bot');
  await actions.click();
  await page.getByRole('menuitem', { name: 'Let the bot answer' }).click();
  await actions.click();
  await page.getByRole('menuitem', { name: 'Take over' }).click();
  await actions.click();
  await expect(page.getByRole('menuitem', { name: 'Let the bot answer' })).toBeVisible();
  await page.keyboard.press('Escape');

  // The header's toggle gives the thread the list's width.
  const conversations = page.getByRole('list', { name: 'Conversations' });

  await header.getByRole('button', { name: 'Hide conversations' }).click();
  await expect(conversations).toBeHidden();
  await header.getByRole('button', { name: 'Show conversations' }).click();
  await expect(conversations).toBeVisible();

  // The member fixes a typo in their reply, and the visitor reads the fixed one.
  await page.getByRole('textbox', { name: 'Reply' }).fill('It ships tomorow.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  const reply = thread.getByRole('article', { name: 'Message' }).filter({ hasText: 'tomorow' });

  await reply.hover();
  await reply.getByRole('button', { name: 'Edit message' }).click();
  // The editor holds the new text, so the row no longer matches `tomorow`.
  await thread.getByRole('textbox', { name: 'Edit message' }).fill('It ships tomorrow.');
  await thread.getByRole('button', { name: 'Save' }).click();
  await expect(thread).toContainText('It ships tomorrow.');
  await expect(thread).toContainText('Edited');

  expect(await visitor.read(conversationId)).toContain('It ships tomorrow.');
});

test('a member without the inbox permission is refused the inbox', async ({ newMember }) => {
  const { page } = await newMember(['frontline.channel.view']);

  await page.goto(INBOX);
  await expect(page.getByText('You need the frontline.inbox.view permission')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Inbox', exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Work queue' })).toBeHidden();
});
