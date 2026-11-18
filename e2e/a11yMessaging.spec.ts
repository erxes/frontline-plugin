import {
  addMessenger,
  expect,
  Id,
  INBOX,
  messengerIn,
  newRecordPath,
  openMessenger,
  openShop,
  pluginApi,
  recordPanel,
  test,
  unique,
  visitorOf,
} from './fixtures.ts';
import { expectAccessible } from './axe.ts';

/*
 * a11y.spec.ts for the inbox, the messenger, the help center and the knowledge base, on the
 * member's screens and on a website.
 */

const KB = '/frontline/knowledgebase';
const ARTICLE = 'Write to us within 30 days.';

/** A topic with a category, a subcategory and a published article, made through the API. */
const knowledgeBase = async (rpc: Awaited<ReturnType<typeof pluginApi>>, title: string) => {
  const create = (kind: string, input: unknown) => rpc(`knowledgebase/${kind}/create`, input, Id);
  const { id: topicId } = await create('topics', { title });
  const { id: parentId } = await create('categories', { topicId, title: 'Billing' });
  const article = { title: 'Refunds', summary: 'Money back', content: `<p>${ARTICLE}</p>` };

  await create('categories', { topicId, title: 'Cards', parentId });
  await create('articles', { ...article, categoryId: parentId, status: 'publish' });

  return topicId;
};

test("a messenger's draft, the messenger in the panel and its settings", async ({
  page,
  api,
  request,
}) => {
  const rpc = await pluginApi(api, request);
  const channel = `Site ${unique()}`;
  const panel = recordPanel(page);

  await rpc('channels/create', { name: channel }, Id);
  await page.goto(INBOX);
  await page.getByRole('button', { name: 'Add messenger' }).first().click();
  await expectAccessible(page, panel.getByLabel('Welcome message'));
  await page.goto(INBOX);

  const key = await addMessenger(page, channel);

  await expectAccessible(page, panel.getByText(key, { exact: true }));
  await panel.getByRole('button', { name: 'Integration actions' }).click();
  await page.getByRole('option', { name: 'Messenger settings' }).click();
  await expectAccessible(page, page.getByRole('textbox', { name: 'Welcome message' }));
});

test('a conversation in the inbox and on its own page', async ({ page, api, request }) => {
  const name = `Ada ${unique()}`;
  const key = await messengerIn(await pluginApi(api, request), { welcome: 'Hi' });
  const visitor = await visitorOf(request, key, { email: `${unique()}@e2e.test`, firstName: name });
  const conversationId = await visitor.write(`Where is my order ${unique()}`);
  const thread = page.getByRole('list', { name: 'Messages' });
  const first = thread.getByRole('article', { name: 'Message' }).first();
  const sidebar = page.getByRole('complementary', { name: 'Customer details' });
  const rail = page.getByRole('toolbar', { name: 'Customer panels' });

  // The open conversation with a pinned message, the customer's panel and a note's tint.
  await page.goto(`${INBOX}?conversationId=${conversationId}`);
  await first.hover();
  await first.getByRole('button', { name: 'Pin' }).click();
  await rail.getByRole('button', { name: 'Customer', exact: true }).click();
  await expect(sidebar.getByText(name)).toBeVisible();
  await expectAccessible(page, page.getByRole('region', { name: 'Pinned messages' }));
  await page.getByRole('tab', { name: 'Internal note' }).click();
  await expectAccessible(page, page.getByRole('textbox', { name: 'Internal note' }));
  await page.goto(`${INBOX}/conversations/${conversationId}`);
  await expectAccessible(page, page.getByText('New', { exact: true }));
});

test('the messenger on a website', async ({ page, api, request }) => {
  const key = await messengerIn(await pluginApi(api, request), { welcome: 'Hi' });

  await using site = await openMessenger(page.context(), key);

  await site.panel.getByRole('button', { name: 'Send us a message' }).click();
  await expectAccessible(site.shop, site.panel.getByRole('textbox', { name: 'Message' }));
});

test('a help center, and its articles on a website', async ({ page, api, request }) => {
  const rpc = await pluginApi(api, request);
  const panel = recordPanel(page);
  const answers = `Answers ${unique()}`;
  const title = `Acme ${unique()}`;
  const kbTopicId = await knowledgeBase(rpc, answers);
  const code = panel.getByLabel('Knowledge base install code');

  await page.goto('/frontline/settings/help-centers');
  await page.getByRole('button', { name: 'Add help center' }).click();
  await expectAccessible(page, panel.getByLabel('Title'));
  await rpc('helpCenters/create', { title, kbTopicId }, Id);
  await page.goto('/frontline/settings/help-centers');
  await page.getByRole('button', { name: title, exact: true }).click();
  await expectAccessible(page, code);
  const installCode = (await code.textContent()) ?? '';

  await panel.getByRole('tab', { name: 'Domain' }).click();
  await expectAccessible(page, panel.getByText('Custom domains are not available'));

  {
    await using site = await openShop(page.context(), installCode);
    const kb = site.shop.getByRole('dialog', { name: answers });

    await site.shop.getByRole('button', { name: `Open ${answers}` }).click();
    await kb.getByRole('button', { name: /^Billing/ }).click();
    await kb.getByRole('button', { name: /^Refunds/ }).click();
    await expectAccessible(site.shop, kb.getByText(ARTICLE));
  }

  const key = await messengerIn(rpc, { knowledgeBaseTopicId: kbTopicId });

  await using site = await openMessenger(page.context(), key);

  await site.panel.getByRole('button', { name: /^Help articles/ }).click();
  await site.panel.getByRole('searchbox', { name: 'Search articles' }).fill('money');
  await site.panel.getByRole('button', { name: /^Refunds/ }).click();
  await expectAccessible(site.shop, site.panel.getByText(ARTICLE));
});

test('the topics, and a topic with its articles and categories', async ({ page, api, request }) => {
  const title = `Help ${unique()}`;
  const topic = `${KB}/${await knowledgeBase(await pluginApi(api, request), title)}`;
  const panel = recordPanel(page);

  // The topics' cards, behind a new topic's draft.
  await page.goto(newRecordPath(KB, 'frontline:kb-topic'));
  await expect(panel.getByRole('textbox', { name: 'Title', exact: true })).toBeVisible();
  await expectAccessible(page, page.getByRole('link', { name: title, exact: true }));
  await page.goto(`${topic}/articles`);
  await page.getByRole('button', { name: 'Refunds', exact: true }).click();
  await expectAccessible(page, panel.getByRole('button', { name: 'Title Refunds', exact: true }));
  await page.goto(`${topic}/categories`);
  await expectAccessible(page, page.getByRole('row', { name: /Cards/ }));
  await page.goto(`${topic}/kbsettings`);
  await expectAccessible(page, page.getByRole('combobox', { name: 'Language' }));
});
