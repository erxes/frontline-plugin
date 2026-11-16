import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { z } from 'zod';
import {
  createChannel,
  expect,
  expectAccessible,
  OWNER,
  recordPanel,
  test,
  unique,
} from './fixtures.ts';

const INBOX = '/frontline/inbox';

/** The messenger's signed-out API, as a website's widget calls it. */
const MESSENGER = 'http://localhost:3399/api/public/messenger';

const Connected = z.object({ token: z.string() });

const Sent = z.object({ conversationId: z.string() });

const VisitorMessages = z.array(z.object({ content: z.string(), fromVisitor: z.boolean() }));

/** A website visitor: connects with the messenger's key, then writes and reads as the widget does. */
const visitorOf = async (request: APIRequestContext, key: string) => {
  const connected = await request.post(`${MESSENGER}/connect`, { data: { key } });

  expect(connected.status()).toBe(200);

  const headers = { authorization: `Bearer ${Connected.parse(await connected.json()).token}` };

  return {
    write: async (content: string, conversationId?: string) => {
      const sent = await request.post(`${MESSENGER}/messages`, {
        headers,
        data: { content, conversationId },
      });

      expect(sent.status()).toBe(201);

      return Sent.parse(await sent.json()).conversationId;
    },
    /** Posts to one of the conversation's routes: `typing`, `person` or `read`. */
    tell: async (conversationId: string, route: string) => {
      const told = await request.post(`${MESSENGER}/conversations/${conversationId}/${route}`, {
        headers,
      });

      expect(told.ok()).toBe(true);
    },
    read: async (conversationId: string) => {
      const listed = await request.get(`${MESSENGER}/conversations/${conversationId}/messages`, {
        headers,
      });

      return VisitorMessages.parse(await listed.json()).map((message) => message.content);
    },
  };
};

/** Opens `select` and picks `option` in it. */
const pick = async (page: Page, select: Locator, option: string) => {
  await select.click();
  await page.getByRole('option', { name: option, exact: true }).click();
};

/** Narrows the inbox with the filter bar: `field` is one of `option`. */
const filterBy = async (page: Page, field: string, option: string) => {
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('option', { name: field, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await page.keyboard.press('Escape');
};

/** Adds a website messenger to `channel` from the inbox's header and returns its key. */
const addMessenger = async (page: Page, channel: string) => {
  const panel = recordPanel(page);
  const name = `Website ${unique()}`;

  await page.getByRole('button', { name: 'Add messenger' }).first().click();
  await pick(page, panel.getByRole('combobox', { name: 'Channel' }), channel);
  await panel.getByLabel('Name').fill(name);
  await panel.getByLabel('Welcome message').fill('Hi, how can we help?');
  await expectAccessible(page);
  await panel.getByRole('button', { name: 'Add messenger' }).click();

  // The key is 32 random bytes, base64url.
  const key = panel.getByText(/^[\w-]{43}$/);

  await expect(key).toBeVisible();
  await expectAccessible(page);

  return (await key.textContent()) ?? '';
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

  await conversations.getByRole('button', { name: new RegExp(late) }).click();
  await expect(thread.getByRole('listitem', { name: 'Message' })).toContainText(late);
  await expectAccessible(page);

  // A reply reaches the visitor; an internal note stays with the team.
  await page.getByRole('textbox', { name: 'Reply' }).fill('It ships today.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(thread).toContainText('It ships today.');
  await page.getByText('Internal note', { exact: true }).click();
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

  await page.getByRole('button', { name: 'Assign', exact: true }).click();
  await page.getByRole('option', { name: fullName }).click();
  await expect(header.getByRole('button', { name: fullName })).toBeVisible();
  await page.getByRole('button', { name: 'Add tags' }).click();
  await page.getByPlaceholder('Search tags').fill(tag);
  await page.getByRole('button', { name: `Create tag: ${tag}` }).click();
  await page.keyboard.press('Escape');
  await expect(header).toContainText(tag);

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
  await expect(page.getByLabel(/^\d+ unread$/)).toBeVisible();
  await page
    .getByRole('list', { name: 'Conversations' })
    .getByRole('button', { name: new RegExp(question.replace('?', '\\?')) })
    .click();

  const thread = page.getByRole('list', { name: 'Messages' });
  const presence = page.getByLabel('Visitor presence');

  await expect(presence).toContainText('1 visit');
  await visitor.tell(conversationId, 'typing');
  await expect(presence).toContainText('Typing…');

  // The visitor asks for a person: the bot says one will answer, and the member can hand it back.
  await visitor.tell(conversationId, 'person');
  await expect(thread).toContainText('A person from the team will answer you here.');
  await expect(thread.getByRole('listitem', { name: 'Message' }).last()).toContainText('Bot');
  await page.getByRole('button', { name: 'Let the bot answer' }).click();
  await page.getByRole('button', { name: 'Take over' }).click();
  await expect(page.getByRole('button', { name: 'Let the bot answer' })).toBeVisible();
  await expectAccessible(page);

  // The member fixes a typo in their reply, and the visitor reads the fixed one.
  await page.getByRole('textbox', { name: 'Reply' }).fill('It ships tomorow.');
  await page.getByRole('button', { name: 'Send' }).click();

  const reply = thread.getByRole('listitem', { name: 'Message' }).filter({ hasText: 'tomorow' });

  await reply.hover();
  await reply.getByRole('button', { name: 'Edit message' }).click();
  await reply.getByRole('textbox', { name: 'Edit message' }).fill('It ships tomorrow.');
  await reply.getByRole('button', { name: 'Save' }).click();
  await expect(thread).toContainText('It ships tomorrow.');
  await expect(thread).toContainText('Edited');
  await expectAccessible(page);
  expect(await visitor.read(conversationId)).toContain('It ships tomorrow.');
});

test('a member without the inbox permission is refused the inbox', async ({ newMember }) => {
  const { page } = await newMember(['frontline.channel.view']);

  await page.goto(INBOX);
  await expect(page.getByText('You need the frontline.inbox.view permission')).toBeVisible();
  await expectAccessible(page);
});
