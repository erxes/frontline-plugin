import type { Locator, Page } from '@playwright/test';
import {
  addMessenger,
  createChannel,
  expect,
  expectAccessible,
  INBOX,
  MESSENGER,
  OWNER,
  pick,
  recordPanel,
  test,
  unique,
  visitorOf,
} from './fixtures.ts';

/** Where a control starts from the left of the page, to check the order of a row. */
const left = async (control: Locator) => (await control.boundingBox())?.x ?? Number.NaN;

/** Narrows the inbox with the filter bar: `field` is one of `option`. */
const filterBy = async (page: Page, field: string, option: string) => {
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('option', { name: field, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await page.keyboard.press('Escape');
};

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

  // axe runs before the filters: erxes-ui's Filter button names itself without its count
  // (DECISIONS.md).
  await page.goto(INBOX);

  const conversations = page.getByRole('list', { name: 'Conversations' });
  const thread = page.getByRole('list', { name: 'Messages' });

  // A row names the integration the conversation came through, beside the customer and the preview.
  const lateRow = conversations.getByRole('button', { name: new RegExp(late) });

  await expect(lateRow).toContainText(/Website \S+/);
  await lateRow.click();
  await expect(thread.getByRole('listitem', { name: 'Message' })).toContainText(late);
  await expectAccessible(page);

  // A reply reaches the visitor; an internal note stays with the team.
  await page.getByRole('textbox', { name: 'Reply' }).fill('It ships today.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(thread).toContainText('It ships today.');
  await page.getByRole('tab', { name: 'Internal note' }).click();
  await page.getByRole('textbox', { name: 'Internal note' }).fill('Courier confirmed.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(thread.getByRole('listitem', { name: 'Internal note' })).toContainText(
    'Courier confirmed.',
  );
  await expectAccessible(page);
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
  // The assignee's button holds more than their name, so it matches by part of its name.
  const assignee = header.getByRole('button', { name: fullName });
  const tags = header.getByRole('button', { name: 'Edit tags', exact: true });
  const resolve = header.getByRole('button', { name: 'Resolve', exact: true });

  expect(await left(assignee)).toBeLessThan(await left(tags));
  expect(await left(tags)).toBeLessThan(await left(resolve));

  const first = thread.getByRole('listitem', { name: 'Message' }).first();

  await first.hover();
  await first.getByRole('button', { name: 'Pin' }).click();
  await expect(page.getByRole('region', { name: 'Pinned messages' })).toContainText(late);
  await expectAccessible(page);

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

test('an admin sets up the messenger on its settings page and visitors get it', async ({
  page,
  request,
  newMember,
}) => {
  const channel = await createChannel(page);
  const title = `Hello from ${unique()}`;

  await page.goto(INBOX);

  const key = await addMessenger(page, channel);

  await recordPanel(page).getByRole('button', { name: 'Integration actions' }).click();
  await page.getByRole('option', { name: 'Messenger settings' }).click();
  await expect(page).toHaveURL(/\/frontline\/inbox\/messengers\/[\w-]+$/);
  await expect(page.getByRole('textbox', { name: 'Welcome message' })).toHaveValue(
    'Hi, how can we help?',
  );
  await expect(page.getByText(`/widget/messenger.js?key=${key}"></script>`)).toBeVisible();
  await expectAccessible(page);

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
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Messenger saved')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Greeting title' })).toHaveValue(title);
  await expect(page.getByRole('combobox', { name: 'Set availability' })).toContainText(
    'By online hours',
  );

  const connected = await request.post(`${MESSENGER}/connect`, { data: { key } });

  expect(await connected.json()).toMatchObject({
    messenger: { greetingTitle: title, color: '#0D9488', requireAuth: true },
  });

  // A member outside the messenger's channel doesn't find it.
  const outsider = await newMember(['frontline.channel.view']);

  await outsider.page.goto(new URL(page.url()).pathname);
  await expect(outsider.page.getByRole('alert')).toContainText('No such integration');
  await expectAccessible(outsider.page);
});

test('a visitor writes from the widget on a website and reads the reply without a reload', async ({
  page,
}) => {
  const channel = await createChannel(page);
  const question = `Do you ship ${unique()} abroad?`;

  await page.goto(INBOX);

  const key = await addMessenger(page, channel);
  const script = new URL(`/widget/messenger.js?key=${key}`, MESSENGER);

  // A shop on another origin than the plugin, with the line the install card gives.
  const shop = await page.context().newPage();

  await shop.route('http://127.0.0.1:3399/shop', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="en"><title>Shop</title><main><h1>Shop</h1></main><script type="module" src="${script.href}"></script></html>`,
    }),
  );
  await shop.goto('http://127.0.0.1:3399/shop');
  await shop.getByRole('button', { name: 'Open the messenger' }).click();

  const panel = shop.getByRole('dialog');

  await expect(panel).toContainText('Hi, how can we help?');
  await panel.getByRole('button', { name: 'Send us a message' }).click();
  await panel.getByRole('textbox', { name: 'Message' }).fill(question);
  await panel.getByRole('button', { name: 'Send' }).click();
  await expect(panel).toContainText(question);
  await expectAccessible(shop);

  await page.goto(INBOX);
  await page
    .getByRole('list', { name: 'Conversations' })
    .getByRole('button', { name: new RegExp(question.replace('?', '\\?')) })
    .click();
  await page.getByRole('textbox', { name: 'Reply' }).fill('Yes, to 40 countries.');
  await page.getByRole('button', { name: 'Send' }).click();

  // The stream tells the widget; it refetches the open conversation.
  await expect(panel).toContainText('Yes, to 40 countries.');
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
  await expect(thread.getByRole('listitem', { name: 'Message' }).last()).toContainText('Bot');
  await actions.click();
  await page.getByRole('menuitem', { name: 'Let the bot answer' }).click();
  await actions.click();
  await page.getByRole('menuitem', { name: 'Take over' }).click();
  await actions.click();
  await expect(page.getByRole('menuitem', { name: 'Let the bot answer' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expectAccessible(page);

  // The header's toggle gives the thread the list's width, and the reply box folds to its tabs.
  const conversations = page.getByRole('list', { name: 'Conversations' });

  await header.getByRole('button', { name: 'Hide conversations' }).click();
  await expect(conversations).toBeHidden();
  await header.getByRole('button', { name: 'Show conversations' }).click();
  await expect(conversations).toBeVisible();
  await page.getByRole('button', { name: 'Fold the reply box' }).click();
  await expect(page.getByRole('textbox', { name: 'Reply' })).toBeHidden();
  await page.getByRole('button', { name: 'Expand the reply box' }).click();

  // The member fixes a typo in their reply, and the visitor reads the fixed one.
  await page.getByRole('textbox', { name: 'Reply' }).fill('It ships tomorow.');
  await page.getByRole('button', { name: 'Send' }).click();

  const reply = thread.getByRole('listitem', { name: 'Message' }).filter({ hasText: 'tomorow' });

  await reply.hover();
  await reply.getByRole('button', { name: 'Edit message' }).click();
  // The editor holds the new text, so the row no longer matches `tomorow`.
  await thread.getByRole('textbox', { name: 'Edit message' }).fill('It ships tomorrow.');
  await thread.getByRole('button', { name: 'Save' }).click();
  await expect(thread).toContainText('It ships tomorrow.');
  await expect(thread).toContainText('Edited');
  await expectAccessible(page);
  expect(await visitor.read(conversationId)).toContain('It ships tomorrow.');
});

test('a member without the inbox permission is refused the inbox', async ({ newMember }) => {
  const { page } = await newMember(['frontline.channel.view']);

  await page.goto(INBOX);
  await expect(page.getByText('You need the frontline.inbox.view permission')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Inbox', exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Work queue' })).toBeHidden();
  await expectAccessible(page);
});
