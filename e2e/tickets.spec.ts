import type { Page } from '@playwright/test';
import {
  addMessenger,
  confirmDelete,
  createPipeline,
  expect,
  expectAccessible,
  filterBy,
  Id,
  INBOX,
  messengerIn,
  openChannelPipelines,
  openMessenger,
  pick,
  pluginApi,
  recordPanel,
  test,
  unique,
} from './fixtures.ts';

const TICKETS = '/frontline/tickets';

// One after the other: every test files tickets in the owner's organisation.
test.describe.configure({ mode: 'default' });

/** A ticket's name in the list, which opens it; its number comes first. */
const ticket = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^\\S*\\s?${name}$`) });

/** Opens one pipeline's tickets from its link under Tickets in the sidebar. */
const openPipeline = async (page: Page, pipeline: string) => {
  await page.goto(TICKETS);
  await page.getByRole('link', { name: pipeline, exact: true }).click();
  await expect(page).toHaveURL(/[?&]pipeline=/);
};

/** Picks the list's display in its Display menu. */
const display = async (page: Page, name: 'List' | 'Board' | 'Table') => {
  await page.getByRole('button', { name: 'Display' }).click();
  await page.getByRole('button', { name, exact: true }).click();
  await page.keyboard.press('Escape');
};

test('a member files, changes and filters tickets in the list', async ({ page }) => {
  const channel = await openChannelPipelines(page);
  // The sidebar lists pipelines once there are two, and a shard starts on a fresh database.
  await createPipeline(page);
  const pipeline = await createPipeline(page);
  const panel = recordPanel(page);
  const refund = `Refund ${unique()}`;
  const login = `Login ${unique()}`;

  // Create ticket drafts one in core's side panel; it then opens there, edited in place.
  await openPipeline(page, pipeline);
  const ofPipeline = page.url();

  await page.getByRole('button', { name: 'Create ticket' }).first().click();
  await pick(page, panel.getByRole('combobox', { name: 'Pipeline' }), `${channel} › ${pipeline}`);
  await panel.getByLabel('Name').fill(refund);

  // The panel and its draft outlive a reload until the ticket is created.
  await page.reload();
  await expect(panel.getByRole('textbox', { name: 'Name' })).toHaveValue(refund);
  await panel.getByRole('button', { name: 'Create ticket' }).click();
  await expect(panel.getByRole('button', { name: `Name ${refund}` })).toBeVisible();
  await pick(page, panel.getByRole('combobox', { name: 'Priority' }), 'High');
  await expect(page.getByRole('combobox', { name: `Priority of ${refund}` })).toHaveText('High');
  await expect(panel.getByText('Status changed')).toBeVisible();

  // Core's Activity tab lists each change, from the events the change published.
  await panel.getByRole('tab', { name: 'Activity' }).click();
  await expect(panel.getByText('Changed priority')).toBeVisible();
  await expect(panel.getByText(`Created ${refund} in New`)).toBeVisible();

  // A status's "+" drafts a ticket in it.
  await page.goto(ofPipeline);
  await page.getByRole('button', { name: 'Add a ticket to New' }).click();
  await panel.getByLabel('Name').fill(login);
  await panel.getByRole('button', { name: 'Create ticket' }).click();
  await expect(page.getByRole('region', { name: 'New' })).toContainText(login);

  // Cancel asks before it throws a draft away.
  const draftName = panel.getByRole('textbox', { name: 'Name' });
  await page.getByRole('button', { name: 'Add a ticket to New' }).click();
  await draftName.fill('Dropped');
  await panel.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Discard' }).click();
  await page.getByRole('button', { name: 'Add a ticket to New' }).click();
  await expect(draftName).toHaveValue('');
  await panel.getByRole('button', { name: 'Cancel' }).click();

  // The filter lives in the address, so a reload keeps it.
  await page.goto(ofPipeline);
  await filterBy(page, 'Priority', 'High');
  await expect(page).toHaveURL(/subject\.priority/);
  await page.reload();
  await expect(ticket(page, refund)).toBeVisible();
  await expect(ticket(page, login)).toBeHidden();
  await page.goto(ofPipeline);
  await expect(ticket(page, login)).toBeVisible();
});

test('a member changes tickets in one go, sees them on the board and deletes them in the table', async ({
  page,
  newMember,
}) => {
  const teammate = await newMember(['frontline.channel.view']);
  const channel = await openChannelPipelines(page, teammate.fullName);
  const pipeline = await createPipeline(page);
  const panel = recordPanel(page);
  const refund = `Refund ${unique()}`;
  const names = [refund, `Login ${unique()}`];

  await openPipeline(page, pipeline);
  const ofPipeline = page.url();

  for (const name of names) {
    await page.getByRole('button', { name: 'Create ticket' }).first().click();
    await pick(page, panel.getByRole('combobox', { name: 'Pipeline' }), `${channel} › ${pipeline}`);
    await panel.getByLabel('Name').fill(name);
    await panel.getByRole('button', { name: 'Create ticket' }).click();
    await expect(panel.getByRole('button', { name: `Name ${name}` })).toBeVisible();
  }

  // A member of the channel changes tickets but can't delete them. Its one pipeline shows first.
  await teammate.page.goto(TICKETS);
  await teammate.page.getByRole('button', { name: `Actions for ${refund}` }).click();
  await expect(teammate.page.getByRole('option', { name: 'Archive' })).toBeVisible();
  await expect(teammate.page.getByRole('option', { name: 'Delete' })).toBeHidden();

  // They follow it from the menu, which then offers to unfollow.
  await teammate.page.getByRole('option', { name: 'Follow' }).click();
  await teammate.page.getByRole('button', { name: `Actions for ${refund}` }).click();
  await expect(teammate.page.getByRole('option', { name: 'Unfollow' })).toBeVisible();
  await teammate.page.keyboard.press('Escape');

  await page.goto(ofPipeline);

  // A status's checkbox picks its tickets, and the bar changes them in one go.
  await page.getByRole('checkbox', { name: 'Select all in New' }).click();
  await pick(page, page.getByRole('button', { name: 'Priority', exact: true }), 'Medium');

  for (const name of names) {
    await expect(page.getByRole('combobox', { name: `Priority of ${name}` })).toHaveText('Medium');
  }

  // The board lays the pipeline's statuses out as columns, each counting its own; Space picks a
  // card up and the arrow keys carry it to the next column, each step said aloud.
  await display(page, 'Board');
  await expect(page.getByRole('region', { name: 'New' })).toContainText(refund);
  await page
    .getByRole('region', { name: 'New' })
    .locator('[aria-roledescription="movable card"]', { hasText: refund })
    .focus();
  await page.keyboard.press('Space');
  await expect(page.getByText(`${refund} is in New.`)).toBeAttached();
  // dnd-kit listens for the arrow keys from the next timer tick after the pick-up.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve)));
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText(`${refund} is in Open.`)).toBeAttached();
  await page.keyboard.press('Space');
  await expect(page.getByRole('region', { name: 'Open' })).toContainText(refund);
  await expect(page.getByRole('region', { name: 'New' })).not.toContainText(refund);

  // The table's bar deletes both.
  await display(page, 'Table');
  await page.getByRole('checkbox', { name: 'Select all rows' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Delete 2 tickets?');
  await confirmDelete(page);
  await expect(page.getByText('2 tickets deleted')).toBeVisible();
  await expect(page.getByText(`No tickets in ${pipeline} yet`)).toBeVisible();
  await display(page, 'List');
});

/** Adds a settings row by its page's Add button and Name field. */
const addSetting = async (page: Page, path: string, button: string, name: string) => {
  await page.goto(`/frontline/settings/${path}`);
  await page.getByRole('button', { name: button }).click();
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
};

test('a member labels a ticket with tags, a department and a property, and filters by them', async ({
  page,
  api,
}) => {
  const tag = `Urgent ${unique()}`;
  const department = `Care ${unique()}`;
  const property = `Plan ${unique()}`;
  const name = `Invoice ${unique()}`;
  const panel = recordPanel(page);

  await addSetting(page, 'tags', 'Add tag', tag);
  // Departments are core's; frontline copies the new one when core tells it.
  await api.units.create({ kind: 'department', name: department });
  // Ticket fields are core's custom fields on `frontline.ticket`.
  const group = await api.fieldGroups.create({ contentType: 'frontline.ticket', name: property });

  await api.fields.create({
    contentType: 'frontline.ticket',
    groupId: group.id,
    label: property,
    type: 'select',
    options: ['Gold', 'Silver'],
  });

  const channel = await openChannelPipelines(page);
  const pipeline = await createPipeline(page);

  await openPipeline(page, pipeline);
  const ofPipeline = page.url();

  await page.getByRole('button', { name: 'Create ticket' }).first().click();
  await pick(page, panel.getByRole('combobox', { name: 'Pipeline' }), `${channel} › ${pipeline}`);
  await panel.getByLabel('Name').fill(name);
  await pick(page, panel.getByLabel(property, { exact: true }), 'Gold');
  await panel.getByRole('button', { name: 'Create ticket' }).click();
  await expect(panel.getByRole('button', { name: `Name ${name}` })).toBeVisible();

  await panel.getByRole('button', { name: 'Tags' }).click();
  await page.getByRole('option', { name: tag }).click();
  await page.keyboard.press('Escape');
  await expect(panel.getByRole('button', { name: 'Tags' })).toContainText(tag);
  await panel.getByRole('button', { name: 'Department' }).click();
  await page.getByRole('option', { name: department }).click();
  await page.keyboard.press('Escape');
  await expect(panel.getByRole('button', { name: 'Department' })).toContainText(department);
  // The panel with tags and a department filled in.
  await expectAccessible(page, panel.getByText('Contacts'));

  // The filter bar narrows the list by the ticket's tag; its card shows the tag and the value.
  await page.goto(ofPipeline);
  await filterBy(page, 'Tags', tag);
  await expect(ticket(page, name)).toBeVisible();
  await display(page, 'Board');
  await expect(page.getByText(`${property}: Gold`)).toBeVisible();
  await display(page, 'List');
  await page.getByRole('button', { name: 'Remove Tags filter' }).click();
  await filterBy(page, 'Department', department);
  await expect(ticket(page, name)).toBeVisible();
  await page.getByRole('button', { name: 'Remove Department filter' }).click();
  await filterBy(page, property, 'Silver');
  await expect(ticket(page, name)).toBeHidden();
  await page.getByRole('button', { name: `Remove ${property} filter` }).click();
  await filterBy(page, property, 'Gold');
  await expect(ticket(page, name)).toBeVisible();
});

test('a visitor files a ticket from the widget in a pipeline the messenger offers', async ({
  page,
}) => {
  const channel = await openChannelPipelines(page);
  const pipeline = await createPipeline(page);
  const subject = `Broken zip ${unique()}`;

  await page.goto(INBOX);

  const key = await addMessenger(page, channel);

  await page.getByRole('checkbox', { name: pipeline }).click();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Messenger saved')).toBeVisible();

  await using site = await openMessenger(page.context(), key);
  const { shop, panel } = site;

  await panel.getByRole('button', { name: /^Tickets/ }).click();
  await expect(panel).toContainText('You have no tickets yet.');

  // The team answers by email or phone, so the visitor leaves one before the form.
  await panel.getByRole('button', { name: 'File a ticket' }).click();
  await panel.getByRole('textbox', { name: 'Email or phone' }).fill(`${unique()}@example.com`);
  await panel.getByRole('button', { name: 'Continue' }).click();
  await panel.getByRole('textbox', { name: 'Subject' }).fill(subject);
  await panel.getByRole('textbox', { name: 'What happened' }).fill('The zip came off on day one.');
  // The widget's ticket form and list show only for a messenger that offers a pipeline.
  await expectAccessible(shop, panel.getByRole('textbox', { name: 'What happened' }));
  await panel.getByRole('button', { name: 'Send ticket' }).click();
  await expect(panel.getByRole('list', { name: 'Your tickets' })).toContainText(subject);
  await expectAccessible(shop, panel.getByRole('list', { name: 'Your tickets' }));

  await openPipeline(page, pipeline);
  await expect(ticket(page, subject)).toBeVisible();
});

test("the widget's ticket form asks for a required field, and shows one only as its Logic says", async ({
  page,
  api,
  request,
}) => {
  const rpc = await pluginApi(api, request);
  const { id: channelId } = await rpc('channels/create', { name: `Support ${unique()}` }, Id);
  const pipeline = { channelId, name: `Returns ${unique()}` };
  const { id: pipelineId } = await rpc('pipelines/create', pipeline, Id);
  const [plan, seats, subject] = [`Plan ${unique()}`, `Seats ${unique()}`, `Team ${unique()}`];

  // A group of this pipeline's alone, so no other spec's ticket asks for its required field.
  const group = await api.fieldGroups.create({
    contentType: 'frontline.ticket',
    name: plan,
    appliesTo: { pipeline: [pipelineId] },
  });

  const field = { contentType: 'frontline.ticket', groupId: group.id } as const;

  const { id: planId } = await api.fields.create({
    ...field,
    label: plan,
    type: 'select',
    options: ['Solo', 'Team'],
    isRequired: true,
  });

  await api.fields.create({
    ...field,
    label: seats,
    type: 'number',
    logic: { action: 'show', rules: [{ fieldId: planId, operator: 'is', value: 'Team' }] },
  });

  const key = await messengerIn(rpc, { ticketPipelineIds: [pipelineId] }, channelId);
  await using site = await openMessenger(page.context(), key);
  const { shop, panel } = site;

  await panel.getByRole('button', { name: /^Tickets/ }).click();
  await panel.getByRole('button', { name: 'File a ticket' }).click();
  await panel.getByRole('textbox', { name: 'Email or phone' }).fill(`${unique()}@example.com`);
  await panel.getByRole('button', { name: 'Continue' }).click();
  await panel.getByRole('textbox', { name: 'Subject' }).fill(subject);
  await expect(panel.getByRole('spinbutton', { name: seats })).toBeHidden();
  await panel.getByRole('button', { name: 'Send ticket' }).click();
  await expect(panel.getByRole('alert')).toHaveText('This field is required');
  await expect(panel.getByRole('combobox', { name: plan })).toHaveAccessibleDescription(
    'This field is required',
  );
  // The refused form, its empty required field marked.
  await expectAccessible(shop, panel.getByRole('alert'));

  await panel.getByRole('combobox', { name: plan }).selectOption('Team');
  await expect(panel.getByRole('alert')).toBeHidden();
  await panel.getByRole('spinbutton', { name: seats }).fill('3');
  await panel.getByRole('button', { name: 'Send ticket' }).click();
  await expect(panel.getByRole('list', { name: 'Your tickets' })).toContainText(subject);
});

test('a member without frontline permissions is refused the tickets', async ({ newMember }) => {
  const { page } = await newMember(['team.view']);

  await page.goto(TICKETS);
  await expect(page.getByText('You need the frontline.channel.view permission')).toBeVisible();
});
