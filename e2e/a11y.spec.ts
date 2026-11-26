import { z } from 'zod';
import {
  addMessenger,
  ARTICLE,
  addTiles,
  callProLine,
  createChannel,
  expect,
  expectAccessible,
  Id,
  INBOX,
  knowledgeBase,
  messengerIn,
  openMessenger,
  openShop,
  pick,
  pluginApi,
  recordPanel,
  recordPath,
  test,
  tileOf,
  unique,
  visitorOf,
} from './fixtures.ts';

/*
 * Every screen a member reaches, once, with data on it, and the panels and sheets it opens;
 * a11y-tickets.spec.ts has the channels, pipelines, tickets and settings. The flow specs run in
 * the light theme; these run in light and dark, so axe checks the contrast of each screen in
 * both. Each test makes its own records, so the tests run apart.
 *
 * An axe pass takes 3 to 4 s on a CI runner, so a test runs axe at most three times and makes
 * its records through the API unless their screen is the one under test. Six passes after a
 * channel and two pipelines made in the UI took the tickets test past its 30 s cap.
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

const Embed = z.object({ code: z.string(), url: z.string(), scriptUrl: z.string() });

test('a messenger and its settings', async ({ page }) => {
  const channel = await createChannel(page);
  const panel = recordPanel(page);

  await page.goto(recordPath(INBOX, 'frontline:integration'));
  await expectAccessible(page, panel.getByLabel('Welcome message'));
  await page.goto(INBOX);

  const key = await addMessenger(page, channel);

  await expectAccessible(page, page.getByRole('textbox', { name: 'Welcome message' }));
  await page.goto(`${INBOX}?panel=/detail/frontline:integration/${page.url().split('/').pop()}`);
  await expectAccessible(page, panel.getByText(key, { exact: true }));
});

test('a conversation in the inbox', async ({ page, api, plugin, request }) => {
  const key = await messengerIn(await pluginApi(api, request), { welcome: 'Hi' });
  const name = `Ada ${unique()}`;
  const thread = page.getByRole('list', { name: 'Messages' });
  const first = thread.getByRole('article', { name: 'Message' }).first();

  const visitor = await visitorOf(request, plugin, key, {
    email: `${unique()}@e2e.test`,
    firstName: name,
  });

  const conversationId = await visitor.write(`Where is my order ${unique()}`);

  // The open conversation with a pinned message and a note's tint.
  await page.goto(`${INBOX}?conversationId=${conversationId}`);
  await first.hover();
  await first.getByRole('button', { name: 'Pin' }).click();
  await expectAccessible(page, page.getByRole('region', { name: 'Pinned messages' }));
  await page.getByRole('tab', { name: 'Internal note' }).click();
  await expectAccessible(page, page.getByRole('textbox', { name: 'Internal note' }));
  await page.goto(`${INBOX}/conversations/${conversationId}`);
  await expectAccessible(page, page.getByText('New', { exact: true }));
});

test('the messenger on a website', async ({ page, api, plugin, request }) => {
  const key = await messengerIn(await pluginApi(api, request), { welcome: 'Hi' });

  await using site = await openMessenger(page.context(), plugin, key);

  await site.panel.getByRole('button', { name: 'Send us a message' }).click();
  await expectAccessible(site.shop, site.panel.getByRole('textbox', { name: 'Message' }));
});

test("a help center's draft, its install code and its domain", async ({ page, api, request }) => {
  const rpc = await pluginApi(api, request);
  const panel = recordPanel(page);
  const title = `Acme ${unique()}`;
  const kbTopicId = await knowledgeBase(rpc, `Answers ${unique()}`);

  await page.goto(HELP_CENTERS);
  // The header's button; an empty list offers a second.
  await page.getByRole('button', { name: 'Add help center' }).first().click();
  await expectAccessible(page, panel.getByLabel('Title'));
  await rpc('helpCenters/create', { title, kbTopicId }, Id);
  await page.goto(HELP_CENTERS);
  await page.getByRole('button', { name: title, exact: true }).click();
  await expectAccessible(page, panel.getByLabel('Knowledge base install code'));
  await panel.getByRole('tab', { name: 'Domain' }).click();
  await expectAccessible(page, panel.getByText('Custom domains are not available'));
});

test("a help center's look, and its articles on a website", async ({
  page,
  api,
  plugin,
  request,
}) => {
  const rpc = await pluginApi(api, request);
  const answers = `Answers ${unique()}`;
  const kbTopicId = await knowledgeBase(rpc, answers);
  const center = await rpc('helpCenters/create', { title: `Acme ${unique()}`, kbTopicId }, Id);
  const code = recordPanel(page).getByLabel('Knowledge base install code');

  await page.goto(recordPath(HELP_CENTERS, 'frontline:help-center', center.id));
  await expect(code).toBeVisible();
  const installCode = (await code.textContent()) ?? '';

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

  await using site = await openMessenger(page.context(), plugin, key);

  await site.panel.getByRole('button', { name: /^Help articles/ }).click();
  await site.panel.getByRole('searchbox', { name: 'Search articles' }).fill('money');
  await site.panel.getByRole('button', { name: /^Refunds/ }).click();
  await expectAccessible(site.shop, site.panel.getByText(ARTICLE));
});

test('the topics, and an article in a topic', async ({ page, api, request }) => {
  const title = `Help ${unique()}`;
  const topic = `${KB}/${await knowledgeBase(await pluginApi(api, request), title)}`;
  const panel = recordPanel(page);

  // The topics' cards, behind a new topic's draft.
  await page.goto(recordPath(KB, 'frontline:kb-topic'));
  await expect(panel.getByRole('textbox', { name: 'Title', exact: true })).toBeVisible();
  await expectAccessible(page, page.getByRole('link', { name: title, exact: true }));
  await page.goto(`${topic}/articles`);
  await page.getByRole('button', { name: 'Refunds', exact: true }).click();
  await expectAccessible(page, panel.getByRole('button', { name: 'Title Refunds', exact: true }));
});

test("a topic's categories and settings", async ({ page, api, request }) => {
  const topic = `${KB}/${await knowledgeBase(await pluginApi(api, request), `Help ${unique()}`)}`;

  await page.goto(`${topic}/categories`);
  await expectAccessible(page, page.getByRole('row', { name: /Cards/ }));
  await page.goto(`${topic}/kbsettings`);
  await expectAccessible(page, page.getByRole('combobox', { name: 'Language' }));
});

test("a survey's draft and the survey it saves", async ({ page, api, request }) => {
  const channel = `Support ${unique()}`;
  const panel = recordPanel(page);
  const title = `After the call ${unique()}`;
  const question = panel.getByRole('textbox', { name: 'Question', exact: true });
  const active = page.getByRole('region', { name: 'Active' });

  await (
    await pluginApi(api, request)
  )('channels/create', { name: channel }, Id);
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
});

test("a survey's results and questions", async ({ page, api, request }) => {
  const rpc = await pluginApi(api, request);
  const { id: channelId } = await rpc('channels/create', { name: `Support ${unique()}` }, Id);
  const options = [{ text: 'Great' }, { text: 'Poor' }];
  const steps = [{ question: 'How did we do?', options }];
  const survey = await rpc('surveys/create', { channelId, title: unique(), steps }, Id);
  const panel = recordPanel(page);

  await page.goto(recordPath(SURVEYS, 'frontline:survey', survey.id));
  await panel.getByRole('tab', { name: 'Results' }).click();
  await expectAccessible(page, panel.getByRole('tabpanel').getByText('0 voters'));
  await panel.getByRole('tab', { name: 'Detail' }).click();
  await panel.getByRole('link', { name: /^Questions/ }).click();
  await expectAccessible(page, page.getByRole('region', { name: 'How did we do?', exact: true }));
});

test("a form's draft and the form it saves", async ({ page, api, request }) => {
  const channel = `Support ${unique()}`;
  const panel = recordPanel(page);
  const name = `Demo request ${unique()}`;

  await (
    await pluginApi(api, request)
  )('channels/create', { name: channel }, Id);
  await page.goto(FORMS);
  await page.getByRole('button', { name: 'New form' }).first().click();
  await pick(page, panel.getByRole('combobox', { name: 'Channel' }), channel);
  await panel.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await panel.getByLabel('Form title').fill('Book a demo');
  await expectAccessible(page, panel.getByLabel('Form title'));
  await panel.getByRole('button', { name: 'Create form' }).click();
  await expectAccessible(
    page,
    page.getByRole('region', { name: 'Active' }).getByRole('button', { name, exact: true }),
  );
});

test("a form's builder, embed and submissions", async ({ page, api, request }) => {
  const rpc = await pluginApi(api, request);
  const channel = await rpc('channels/create', { name: `Support ${unique()}` }, Id);
  const form = await rpc('forms/create', { channelId: channel.id, name: unique() }, Id);
  const formId = form.id;
  const { code, url, scriptUrl } = await rpc('forms/embed', { id: formId }, Embed);
  const field = await rpc('forms/fields/add', { formId, type: 'text', label: 'Company' }, Id);
  // The install code the form's panel offers for an embedded form.
  const installCode = `<div data-frontline-form="${code}"></div><script type="module" src="${scriptUrl}"></script>`;

  await page.goto(`${FORMS}/${formId}/builder`);
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

test('the call history, a call in the panel, the queues and the phone', async ({ page, api }) => {
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
  await page.goto('/frontline/calls/phone');
  await expectAccessible(page, page.getByText('You have no phone line'));
});

test("the home dashboard's tiles, the Reports page, and one refused", async ({ newMember }) => {
  const agent = await newMember([
    'frontline.call.view',
    'frontline.channel.view',
    'frontline.inbox.view',
  ]);

  const stranger = await newMember(['team.view']);
  const tiles = ['Top numbers', 'Call summary', 'Ticket summary', 'Conversations over time'];

  await addTiles(agent.page, tiles);
  await expectAccessible(agent.page, tileOf(agent.page, 'Call summary').getByText('Service level'));

  await agent.page.goto('/frontline/reports/facebook');
  await expectAccessible(
    agent.page,
    agent.page.getByRole('region', { name: 'Summary' }).getByText('Direct conversations'),
  );

  await addTiles(stranger.page, ['Call summary']);
  await expectAccessible(stranger.page, tileOf(stranger.page, 'Call summary').getByRole('alert'));
  // The Reports pages refuse them card by card, as the dashboard does.
  await stranger.page.goto('/frontline/reports/call');
  await expect(tileOf(stranger.page, 'Top numbers').getByRole('alert')).toBeVisible();
});

test('the Reports pages for conversations, tickets and calls', async ({ newMember }) => {
  const { page } = await newMember([
    'frontline.call.view',
    'frontline.channel.view',
    'frontline.inbox.view',
  ]);

  for (const [path, shown] of [
    ['/frontline/reports', 'Unresolved now'],
    ['/frontline/reports/ticket', 'Overdue now'],
    ['/frontline/reports/call', 'Service level'],
  ] as const) {
    await page.goto(path);
    await expectAccessible(page, page.getByRole('region', { name: 'Summary' }).getByText(shown));
  }
});

const refused = [INBOX, '/frontline/tickets', FORMS, SURVEYS, KB, HELP_CENTERS, HISTORY];

for (const path of [...refused, `${SETTINGS}/channels`, `${SETTINGS}/integrations`]) {
  test(`a member without the permission is refused ${path}`, async ({ newMember }) => {
    const { page } = await newMember(['team.view']);

    await page.goto(path);
    await expectAccessible(page, page.getByText(/You need the frontline\.\S+ permission/).first());
  });
}
