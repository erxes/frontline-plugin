import type { Page } from '@playwright/test';
import {
  addMessenger,
  confirmDelete,
  createPipeline,
  expect,
  expectAccessible,
  INBOX,
  openChannelPipelines,
  openMessenger,
  pick,
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

/** Narrows the list with the filter bar: `field` is one of `option`. */
const filterBy = async (page: Page, field: string, option: string) => {
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('option', { name: field, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await page.keyboard.press('Escape');
};

/** Picks the list's display in its Display menu. */
const display = async (page: Page, name: 'List' | 'Board' | 'Table') => {
  await page.getByRole('button', { name: 'Display' }).click();
  await page.getByRole('button', { name, exact: true }).click();
  await page.keyboard.press('Escape');
};

test('a member files, changes and filters tickets in the list', async ({ page }) => {
  const channel = await openChannelPipelines(page);
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
  await expectAccessible(page);
  await panel.getByRole('button', { name: 'Create ticket' }).click();
  await expect(panel.getByRole('button', { name: `Name ${refund}` })).toBeVisible();
  await pick(page, panel.getByRole('combobox', { name: 'Priority' }), 'High');
  await expect(page.getByRole('combobox', { name: `Priority of ${refund}` })).toHaveText('High');
  await expectAccessible(page);

  // Core's Activity tab lists each change, from the events the change published.
  await panel.getByRole('tab', { name: 'Activity' }).click();
  await expect(panel.getByText('Changed priority')).toBeVisible();
  await expect(panel.getByText(`Created ${refund} in New`)).toBeVisible();
  await expectAccessible(page);

  // A status's "+" drafts a ticket in it.
  await page.goto(ofPipeline);
  await page.getByRole('button', { name: 'Add a ticket to New' }).click();
  await panel.getByLabel('Name').fill(login);
  await panel.getByRole('button', { name: 'Create ticket' }).click();
  await expect(page.getByRole('region', { name: 'New' })).toContainText(login);

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
  await teammate.page.keyboard.press('Escape');
  await expectAccessible(teammate.page);

  await page.goto(ofPipeline);

  // A status's checkbox picks its tickets, and the bar changes them in one go.
  await page.getByRole('checkbox', { name: 'Select all in New' }).click();
  await pick(page, page.getByRole('button', { name: 'Priority', exact: true }), 'Medium');

  for (const name of names) {
    await expect(page.getByRole('combobox', { name: `Priority of ${name}` })).toHaveText('Medium');
  }

  // The board lays the pipeline's statuses out as columns.
  await display(page, 'Board');
  await expect(page.getByRole('region', { name: 'New' })).toContainText(refund);
  await expectAccessible(page);

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
  await page.goto('/frontline/settings/ticket-properties');
  await page.getByRole('button', { name: 'Add property' }).click();
  await page.getByRole('dialog').getByLabel('Label', { exact: true }).fill(property);
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('row', { name: new RegExp(property) })).toBeVisible();

  const channel = await openChannelPipelines(page);
  const pipeline = await createPipeline(page);

  await openPipeline(page, pipeline);
  const ofPipeline = page.url();

  await page.getByRole('button', { name: 'Create ticket' }).first().click();
  await pick(page, panel.getByRole('combobox', { name: 'Pipeline' }), `${channel} › ${pipeline}`);
  await panel.getByLabel('Name').fill(name);
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
  // Empty properties wait behind a button, so the panel shows only what the ticket has.
  await expect(panel.getByRole('button', { name: property })).toBeHidden();
  await panel.getByRole('button', { name: /^Show \d+ empty propert/ }).click();
  await panel.getByRole('button', { name: property }).click();
  await page.getByPlaceholder(property, { exact: true }).fill('Gold');
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('button', { name: property })).toContainText('Gold');
  await expect(panel.getByText('Contacts')).toBeVisible();
  await expectAccessible(page);

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
});

test('a visitor files a ticket from the widget in a pipeline the messenger offers', async ({
  page,
}) => {
  const channel = await openChannelPipelines(page);
  const pipeline = await createPipeline(page);
  const subject = `Broken zip ${unique()}`;

  await page.goto(INBOX);

  const key = await addMessenger(page, channel);

  await recordPanel(page).getByRole('button', { name: 'Integration actions' }).click();
  await page.getByRole('option', { name: 'Messenger settings' }).click();
  await page.getByRole('checkbox', { name: pipeline }).click();
  await expectAccessible(page);
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
  await expectAccessible(shop);
  await panel.getByRole('button', { name: 'Send ticket' }).click();
  await expect(panel.getByRole('list', { name: 'Your tickets' })).toContainText(subject);
  await expectAccessible(shop);

  await openPipeline(page, pipeline);
  await expect(ticket(page, subject)).toBeVisible();
});

test('a member without frontline permissions is refused the tickets', async ({ newMember }) => {
  const { page } = await newMember(['team.view']);

  await page.goto(TICKETS);
  await expect(page.getByText('You need the frontline.channel.view permission')).toBeVisible();
  await expectAccessible(page);
});
