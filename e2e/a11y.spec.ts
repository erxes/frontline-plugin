import {
  addMessenger,
  ARTICLE,
  addTiles,
  callProLine,
  createChannel,
  createPipeline,
  expect,
  expectAccessible,
  Id,
  INBOX,
  knowledgeBase,
  messengerIn,
  newRecordPath,
  openChannelPipelines,
  openMessenger,
  openShop,
  pick,
  pluginApi,
  recordPanel,
  test,
  tileOf,
  unique,
  visitorOf,
} from './fixtures.ts';

/*
 * Every screen a member reaches, once, with data on it, and the panels and sheets it opens. The
 * flow specs run in the light theme; this one runs in light and dark, so axe checks the contrast
 * of each screen in both. Each test makes its own records, so the tests run apart.
 *
 * axe stays clear of three states erxes-ui gets wrong: an open `/` menu leaves `aria-expanded` on
 * its editor (erxes/erxes#10611), the bulk bar's dialog has no name (erxes/erxes#10610), and the
 * Filter button names itself without its count (DECISIONS.md).
 */

const SETTINGS = '/frontline/settings';
const KB = '/frontline/knowledgebase';
const HELP_CENTERS = '/frontline/help-centers';
const FORMS = '/frontline/forms';
const SURVEYS = '/frontline/surveys';
const HISTORY = '/frontline/calls/history';

test('a channel, its members and its response templates', async ({ page }) => {
  const panel = recordPanel(page);
  const content = panel.getByRole('textbox', { name: 'Content' });

  await page.goto(newRecordPath(`${SETTINGS}/channels`, 'frontline:channel'));
  await expectAccessible(page, panel.getByLabel('Name'));
  await createChannel(page);
  await expectAccessible(page, panel.getByRole('link', { name: /Manage channel members/ }));
  await panel.getByRole('link', { name: /Manage channel members/ }).click();
  await expectAccessible(page, page.getByRole('combobox', { name: 'Role: Admin' }));

  await page.goto(page.url().replace(/members$/, 'response'));
  await page.getByRole('button', { name: 'Create response template' }).first().click();
  await panel.getByLabel('Name').fill('Greeting');
  await content.fill('Hello, thanks for writing to us.');
  await expectAccessible(page, content);
  await panel.getByRole('button', { name: 'Create response template' }).click();
  await expectAccessible(page, page.getByRole('row', { name: /Greeting/ }));
});

test("a pipeline, its draft and its panel's tabs", async ({ page }) => {
  const panel = recordPanel(page);

  await openChannelPipelines(page);
  await page.getByRole('button', { name: 'Create pipeline' }).click();
  await panel.getByLabel('Name').fill(`Returns ${unique()}`);
  await expectAccessible(page, panel.getByLabel('Name'));
  await panel.getByRole('button', { name: 'Create pipeline' }).click();
  await expectAccessible(page, panel.getByRole('button', { name: /^Ticket number/ }));

  await panel.getByRole('tab', { name: 'Ticket statuses' }).click();
  await expectAccessible(page, panel.getByRole('region', { name: 'Open' }));
  await panel.getByRole('tab', { name: 'SLA' }).click();
  await panel.getByRole('switch', { name: 'Keep an SLA' }).click();
  await expectAccessible(page, panel.getByRole('button', { name: /^Warn before/ }));
  await panel.getByRole('tab', { name: 'Permissions' }).click();
  await panel.getByRole('switch', { name: 'New is private' }).click();
  await expectAccessible(page, panel.getByText('Who sees it'));
});

test('tickets in the list, the board and the table, and one in the panel', async ({ page }) => {
  const channel = await openChannelPipelines(page);
  // The sidebar lists pipelines once there are two.
  await createPipeline(page);
  const pipeline = await createPipeline(page);
  const panel = recordPanel(page);
  const name = `Refund ${unique()}`;

  await page.goto('/frontline/tickets');
  await page.getByRole('link', { name: pipeline, exact: true }).click();
  await expect(page).toHaveURL(/[?&]pipeline=/);
  const ofPipeline = page.url();

  await page.getByRole('button', { name: 'Create ticket' }).first().click();
  await pick(page, panel.getByRole('combobox', { name: 'Pipeline' }), `${channel} › ${pipeline}`);
  await panel.getByLabel('Name').fill(name);
  await expectAccessible(page, panel.getByLabel('Name'));
  await panel.getByRole('button', { name: 'Create ticket' }).click();
  await expectAccessible(page, panel.getByRole('button', { name: `Name ${name}` }));
  await panel.getByRole('tab', { name: 'Activity' }).click();
  await expectAccessible(page, panel.getByText(`Created ${name} in New`));

  await page.goto(ofPipeline);
  await expectAccessible(page, page.getByRole('region', { name: 'New' }).getByText(name));

  for (const display of ['Board', 'Table']) {
    await page.getByRole('button', { name: 'Display' }).click();
    await page.getByRole('button', { name: display, exact: true }).click();
    await page.keyboard.press('Escape');
    await expectAccessible(page, page.getByText(name));
  }
});

test('a messenger and its settings', async ({ page }) => {
  const channel = await createChannel(page);
  const panel = recordPanel(page);

  await page.goto(INBOX);
  await page.getByRole('button', { name: 'Add messenger' }).first().click();
  await expectAccessible(page, panel.getByLabel('Welcome message'));
  await page.goto(INBOX);

  const key = await addMessenger(page, channel);

  await expectAccessible(page, page.getByRole('textbox', { name: 'Welcome message' }));
  await page.goto(`${INBOX}?panel=/detail/frontline:integration/${page.url().split('/').pop()}`);
  await expectAccessible(page, panel.getByText(key, { exact: true }));
});

test('a conversation in the inbox', async ({ page, api, request }) => {
  const key = await messengerIn(await pluginApi(api, request), { welcome: 'Hi' });
  const name = `Ada ${unique()}`;
  const thread = page.getByRole('list', { name: 'Messages' });
  const first = thread.getByRole('article', { name: 'Message' }).first();
  const sidebar = page.getByRole('complementary', { name: 'Customer details' });
  const rail = page.getByRole('toolbar', { name: 'Customer panels' });
  const visitor = await visitorOf(request, key, { email: `${unique()}@e2e.test`, firstName: name });
  const conversationId = await visitor.write(`Where is my order ${unique()}`);

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

  await page.goto(HELP_CENTERS);
  // The header's button; an empty list offers a second.
  await page.getByRole('button', { name: 'Add help center' }).first().click();
  await expectAccessible(page, panel.getByLabel('Title'));
  const center = await rpc('helpCenters/create', { title, kbTopicId }, Id);
  await page.goto(HELP_CENTERS);
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

  await page.goto(`${HELP_CENTERS}/${center.id}/appearance`);
  await expectAccessible(page, page.getByRole('textbox', { name: 'Wordmark' }));

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

test("a survey's draft, panel, questions and results", async ({ page }) => {
  const channel = await createChannel(page);
  const panel = recordPanel(page);
  const title = `After the call ${unique()}`;
  const question = panel.getByRole('textbox', { name: 'Question', exact: true });
  const active = page.getByRole('region', { name: 'Active' });

  await page.goto(SURVEYS);
  await page.getByRole('button', { name: 'New survey' }).first().click();
  await pick(page, panel.getByRole('combobox', { name: 'Channel' }), channel);
  await panel.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
  await question.fill('How did we do?');

  for (const option of ['Great', 'Poor']) {
    await panel.getByPlaceholder('Type an option and press Enter').fill(option);
    await page.keyboard.press('Enter');
  }

  await expectAccessible(page, question);
  await panel.getByRole('button', { name: 'Create survey' }).click();
  await expectAccessible(page, active.getByRole('button', { name: title, exact: true }));
  await panel.getByRole('tab', { name: 'Results' }).click();
  await expectAccessible(page, panel.getByRole('tabpanel').getByText('0 voters'));
  await panel.getByRole('tab', { name: 'Detail' }).click();
  await panel.getByRole('link', { name: /^Questions/ }).click();
  await expectAccessible(page, page.getByRole('region', { name: 'How did we do?', exact: true }));
});

test("a form's draft, panel, builder, embed and submissions", async ({ page, api, request }) => {
  const rpc = await pluginApi(api, request);
  const channel = await createChannel(page);
  const panel = recordPanel(page);
  const name = `Demo request ${unique()}`;
  const active = page.getByRole('region', { name: 'Active' });

  await page.goto(FORMS);
  await page.getByRole('button', { name: 'New form' }).first().click();
  await pick(page, panel.getByRole('combobox', { name: 'Channel' }), channel);
  await panel.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await panel.getByLabel('Form title').fill('Book a demo');
  await expectAccessible(page, panel.getByLabel('Form title'));
  await panel.getByRole('button', { name: 'Create form' }).click();
  await expectAccessible(page, active.getByRole('button', { name, exact: true }));
  await panel.getByRole('button', { name: 'Show install code' }).click();
  const installCode = (await panel.getByLabel('Install code').textContent()) ?? '';
  const url = (await panel.getByText(/\/api\/public\//).textContent()) ?? '';

  await panel.getByRole('link', { name: /^Fields/ }).click();
  await expect(page).toHaveURL(/\/builder$/);
  const formId = page.url().split('/').at(-2) ?? '';
  const field = await rpc('forms/fields/add', { formId, type: 'text', label: 'Company' }, Id);

  await page.reload();
  await expectAccessible(page, page.getByRole('region', { name: 'Preview' }).getByLabel('Company'));

  {
    await using site = await openShop(page.context(), installCode);

    await expectAccessible(site.shop, site.shop.getByRole('form').getByLabel('Company'));
  }

  const sent = await request.post(url, { data: { answers: { [field.id]: 'Acme' } } });

  expect(sent.status()).toBe(201);
  await page.goto(`${FORMS}/${formId}/submissions`);
  await expectAccessible(page, page.getByRole('row', { name: /Acme/ }));
});

test('tags and integrations, with their sheets', async ({ page }) => {
  const sheet = page.getByRole('dialog');
  const tag = `VIP ${unique()}`;

  await page.goto(`${SETTINGS}/tags`);
  await page.getByRole('button', { name: 'Add tag' }).click();
  await sheet.getByLabel('Name', { exact: true }).fill(tag);
  await expectAccessible(page, sheet.getByLabel('Name', { exact: true }));
  await sheet.getByRole('button', { name: 'Create' }).click();
  await expectAccessible(page, page.getByRole('row', { name: new RegExp(tag) }));

  await page.goto(`${SETTINGS}/integrations`);
  await expectAccessible(page, page.getByRole('button', { name: 'Connect' }));
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('menuitem', { name: 'Telegram bot' }).click();
  await expectAccessible(page, recordPanel(page).getByLabel('Bot token'));
});

test('the call history, a call in the panel and the queues', async ({ page, api }) => {
  const caller = `9912${String(Date.now()).slice(-4)}`;
  const post = await callProLine(api, page.request, `7556${String(Date.now()).slice(-4)}`);
  const call = `a-${unique()}`;
  const row = page.getByRole('row').filter({ hasText: caller });

  await post(call, caller, 'RINGING');
  await post(call, caller, 'ANSWERED');
  await page.goto(HISTORY);
  await expectAccessible(page, row);
  await row
    .getByRole('button', { name: new RegExp(caller) })
    .first()
    .click();
  await expectAccessible(page, recordPanel(page).getByRole('link', { name: 'Open in inbox' }));
  await page.goto('/frontline/calls/queues');
  await expectAccessible(page, page.getByText('No queues yet'));
});

test("the home dashboard's tiles, and one refused", async ({ newMember }) => {
  const agent = await newMember(['frontline.call.view', 'frontline.channel.view']);
  const stranger = await newMember(['team.view']);
  const tiles = ['Top numbers', 'Call summary', 'Ticket summary', 'Conversations over time'];

  await addTiles(agent.page, tiles);
  await expectAccessible(agent.page, tileOf(agent.page, 'Call summary').getByText('Service level'));
  await addTiles(stranger.page, ['Call summary']);
  await expectAccessible(stranger.page, tileOf(stranger.page, 'Call summary').getByRole('alert'));
});

const refused = [INBOX, '/frontline/tickets', FORMS, SURVEYS, KB, HELP_CENTERS, HISTORY];

for (const path of [...refused, `${SETTINGS}/channels`]) {
  test(`a member without the permission is refused ${path}`, async ({ newMember }) => {
    const { page } = await newMember(['team.view']);

    await page.goto(path);
    await expectAccessible(page, page.getByText(/You need the frontline\.\S+ permission/).first());
  });
}
