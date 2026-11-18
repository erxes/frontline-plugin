import {
  createChannel,
  expectAccessible,
  Id,
  pick,
  pipelineIn,
  pluginApi,
  recordPanel,
  recordPath,
  test,
  unique,
} from './fixtures.ts';

/*
 * The channels, pipelines, tickets and settings screens through axe, in light and dark, by
 * a11y.spec.ts's rules: at most three axe passes a test, and records made through the API
 * unless their screen is the one under test.
 */

const SETTINGS = '/frontline/settings';

test('a channel and its members', async ({ page }) => {
  const panel = recordPanel(page);

  await page.goto(recordPath(`${SETTINGS}/channels`, 'frontline:channel'));
  await expectAccessible(page, panel.getByLabel('Name'));
  await createChannel(page);
  await expectAccessible(page, panel.getByRole('link', { name: /Manage channel members/ }));
  await panel.getByRole('link', { name: /Manage channel members/ }).click();
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

test('the integrations, and a Telegram bot drafted', async ({ page }) => {
  await page.goto(`${SETTINGS}/integrations`);
  await expectAccessible(page, page.getByRole('button', { name: 'Connect' }));
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('menuitem', { name: 'Telegram bot' }).click();
  await expectAccessible(page, recordPanel(page).getByLabel('Bot token'));
});
