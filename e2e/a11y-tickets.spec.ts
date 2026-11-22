import {
  createChannel,
  expectAccessible,
  Id,
  INBOX,
  messengerIn,
  pick,
  pluginApi,
  recordPanel,
  recordPath,
  type Rpc,
  test,
  unique,
  visitorOf,
} from './fixtures.ts';
import { channelSections } from './channelSettings.ts';

/*
 * The channels, pipelines, tickets and settings screens through axe, in light and dark, by
 * a11y.spec.ts's rules: at most three axe passes a test, and records made through the API
 * unless their screen is the one under test.
 */

const SETTINGS = '/frontline/settings';

/** A channel with one pipeline, made through the API, by name and id. */
const pipelineIn = async (rpc: Rpc) => {
  const channel = { name: `Support ${unique()}` };
  const { id: channelId } = await rpc('channels/create', channel, Id);
  const pipeline = { channelId, name: `Returns ${unique()}` };
  const { id } = await rpc('pipelines/create', pipeline, Id);

  return { channel: channel.name, channelId, name: pipeline.name, id };
};

test('a channel and its members', async ({ page }) => {
  const panel = recordPanel(page);

  await page.goto(recordPath(`${SETTINGS}/channels`, 'frontline:channel'));
  await expectAccessible(page, panel.getByLabel('Name'));
  await createChannel(page);
  await expectAccessible(page, channelSections(page));
  await channelSections(page).getByRole('link', { name: 'Members' }).click();
  await expectAccessible(page, page.getByRole('link', { name: 'Manage channel members' }));
  await page.getByRole('link', { name: 'Manage channel members' }).click();
  await expectAccessible(page, page.getByRole('combobox', { name: 'Role: Admin' }));
});

test("a channel's response templates", async ({ page, api, request }) => {
  const rpc = await pluginApi(api, request);
  const { id } = await rpc('channels/create', { name: `Support ${unique()}` }, Id);
  const panel = recordPanel(page);
  const content = panel.getByRole('textbox', { name: 'Content' });

  await page.goto(`${SETTINGS}/channels/${id}/response`);
  await page.getByRole('button', { name: 'Create response template' }).first().click();
  await panel.getByLabel('Name').fill('Greeting');
  await content.fill('Hello, thanks for writing to us.');
  await expectAccessible(page, content);
  await panel.getByRole('button', { name: 'Create response template' }).click();
  await expectAccessible(page, page.getByRole('row', { name: /Greeting/ }));
});

test("a pipeline's draft and the pipeline it saves", async ({ page, api, request }) => {
  const rpc = await pluginApi(api, request);
  const { id } = await rpc('channels/create', { name: `Support ${unique()}` }, Id);
  const panel = recordPanel(page);

  await page.goto(`${SETTINGS}/channels/${id}/pipelines`);
  await page.getByRole('button', { name: 'Create pipeline' }).first().click();
  await panel.getByLabel('Name').fill(`Returns ${unique()}`);
  await expectAccessible(page, panel.getByLabel('Name'));
  await panel.getByRole('button', { name: 'Create pipeline' }).click();
  await expectAccessible(page, panel.getByRole('button', { name: /^Ticket number/ }));
});

test("a pipeline's statuses, SLA and permissions", async ({ page, api, request }) => {
  const pipeline = await pipelineIn(await pluginApi(api, request));
  const list = `${SETTINGS}/channels/${pipeline.channelId}/pipelines`;
  const panel = recordPanel(page);

  await page.goto(recordPath(list, 'frontline:pipeline', pipeline.id));
  await panel.getByRole('tab', { name: 'Ticket statuses' }).click();
  await expectAccessible(page, panel.getByRole('region', { name: 'Open' }));
  await panel.getByRole('tab', { name: 'SLA' }).click();
  await panel.getByRole('switch', { name: 'Keep an SLA' }).click();
  await expectAccessible(page, panel.getByRole('button', { name: /^Warn before/ }));
  await panel.getByRole('tab', { name: 'Permissions' }).click();
  await panel.getByRole('switch', { name: 'New is private' }).click();
  await expectAccessible(page, panel.getByText('Who sees it'));
});

test("a ticket's draft, the ticket it saves and its activity", async ({ page, api, request }) => {
  const { channel, name: pipeline, id } = await pipelineIn(await pluginApi(api, request));
  const panel = recordPanel(page);
  const name = `Refund ${unique()}`;

  await page.goto(`/frontline/tickets?pipeline=${id}`);
  await page.getByRole('button', { name: 'Create ticket' }).first().click();
  await pick(page, panel.getByRole('combobox', { name: 'Pipeline' }), `${channel} › ${pipeline}`);
  await panel.getByLabel('Name').fill(name);
  await expectAccessible(page, panel.getByLabel('Name'));
  await panel.getByRole('button', { name: 'Create ticket' }).click();
  await expectAccessible(page, panel.getByRole('button', { name: `Name ${name}` }));
  await panel.getByRole('tab', { name: 'Activity' }).click();
  await expectAccessible(page, panel.getByText(`Created ${name} in New`));
});

test("a ticket's comments for its customer", async ({ page, api, request }) => {
  const rpc = await pluginApi(api, request);
  const pipeline = await pipelineIn(rpc);
  const { id } = await rpc('tickets/create', { pipelineId: pipeline.id, name: unique() }, Id);
  const panel = recordPanel(page);

  await rpc('tickets/addComment', { ticketId: id, body: 'A new zip is on its way.' }, Id);
  await page.goto(recordPath('/frontline/tickets', 'frontline:ticket', id));
  await panel.getByRole('tab', { name: 'Comments' }).click();
  await expectAccessible(page, panel.getByText('A new zip is on its way.'));
});

test('a ticket drafted from a conversation', async ({ page, api, plugin, request }) => {
  const rpc = await pluginApi(api, request);
  const pipeline = await pipelineIn(rpc);
  const key = await messengerIn(rpc, { welcome: 'Hi' }, pipeline.channelId);
  const panel = recordPanel(page);

  const visitor = await visitorOf(request, plugin, key, {
    email: `${unique()}@e2e.test`,
    firstName: `Ada ${unique()}`,
  });

  const conversationId = await visitor.write(`Where is my order ${unique()}`);

  await page.goto(`${INBOX}?conversationId=${conversationId}`);
  await page
    .getByRole('region', { name: 'Conversation' })
    .getByRole('button', { name: 'Create ticket' })
    .click();
  await expectAccessible(page, panel.getByLabel('Name'));
});

test('tickets in the list, the board and the table', async ({ page, api, request }) => {
  const rpc = await pluginApi(api, request);
  const pipeline = await pipelineIn(rpc);
  const name = `Refund ${unique()}`;

  // The sidebar lists pipelines once there are two, so axe checks its links with one active.
  await rpc('pipelines/create', { channelId: pipeline.channelId, name: unique() }, Id);
  await rpc('tickets/create', { pipelineId: pipeline.id, name }, Id);
  await page.goto(`/frontline/tickets?pipeline=${pipeline.id}`);
  await expectAccessible(page, page.getByRole('region', { name: 'New' }).getByText(name));

  for (const display of ['Board', 'Table']) {
    await page.getByRole('button', { name: 'Display' }).click();
    await page.getByRole('button', { name: display, exact: true }).click();
    await page.keyboard.press('Escape');
    await expectAccessible(page, page.getByText(name));
  }
});

test('tags and their sheet', async ({ page }) => {
  const sheet = page.getByRole('dialog');
  const tag = `VIP ${unique()}`;

  await page.goto(`${SETTINGS}/tags`);
  await page.getByRole('button', { name: 'Add tag' }).click();
  await sheet.getByLabel('Name', { exact: true }).fill(tag);
  await expectAccessible(page, sheet.getByLabel('Name', { exact: true }));
  await sheet.getByRole('button', { name: 'Create' }).click();
  await expectAccessible(page, page.getByRole('row', { name: new RegExp(tag) }));
});

test("Telegram's accounts in core's Integrations, and a Telegram bot drafted", async ({ page }) => {
  await page.goto('/settings/integrations/frontline.telegram?tab=accounts');
  await expectAccessible(page, page.getByRole('button', { name: 'Connect', exact: true }));
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expectAccessible(page, recordPanel(page).getByLabel('Bot token'));
});
