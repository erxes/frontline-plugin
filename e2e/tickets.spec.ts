import type { Locator, Page } from '@playwright/test';
import {
  confirmDelete,
  createPipeline,
  expect,
  expectAccessible,
  openChannelPipelines,
  recordPanel,
  test,
  unique,
} from './fixtures.ts';

const TICKETS = '/frontline/tickets';

// One after the other: every test files tickets in the owner's organisation, and a list without
// a pipeline filter groups by each pipeline's statuses once two pipelines hold tickets.
test.describe.configure({ mode: 'default' });

/** Opens `select` and picks `option` in it. */
const pick = async (page: Page, select: Locator, option: string) => {
  await select.click();
  await page.getByRole('option', { name: option, exact: true }).click();
};

/** A ticket's name in the list, which opens it; its number comes first. */
const ticket = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^\\S*\\s?${name}$`) });

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

test('a member files, filters, changes and deletes tickets in the list, board and table', async ({
  page,
  newMember,
}) => {
  const teammate = await newMember(['frontline.channel.view']);
  const channel = await openChannelPipelines(page, teammate.fullName);
  const pipeline = await createPipeline(page);
  const panel = recordPanel(page);
  const refund = `Refund ${unique()}`;
  const login = `Login ${unique()}`;

  // Frontline opens on its tickets. Create ticket drafts one in core's side panel; it then opens
  // there, edited in place.
  await page.goto('/frontline');
  await expect(page).toHaveURL(new RegExp(`${TICKETS}$`));
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
  await page.goto(TICKETS);
  await filterBy(page, 'Pipeline', pipeline);
  const ofPipeline = page.url();

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
  await page.getByRole('button', { name: 'Remove filter' }).last().click();
  await expect(ticket(page, login)).toBeVisible();

  // A member of the channel changes tickets but can't delete them.
  await teammate.page.goto(TICKETS);
  await teammate.page.getByRole('button', { name: `Actions for ${login}` }).click();
  await expect(teammate.page.getByRole('option', { name: 'Archive' })).toBeVisible();
  await expect(teammate.page.getByRole('option', { name: 'Delete' })).toBeHidden();
  await teammate.page.keyboard.press('Escape');
  await expectAccessible(teammate.page);

  // A status's checkbox picks its tickets, and the bar changes them in one go.
  await page.getByRole('checkbox', { name: 'Select all in New' }).click();
  await pick(page, page.getByRole('button', { name: 'Priority', exact: true }), 'Medium');
  await expect(page.getByRole('combobox', { name: `Priority of ${login}` })).toHaveText('Medium');
  await expect(page.getByRole('combobox', { name: `Priority of ${refund}` })).toHaveText('Medium');

  // The board lays the pipeline's statuses out as columns.
  await display(page, 'Board');
  await expect(page.getByRole('region', { name: 'New' })).toContainText(refund);

  // axe runs with no rule applied: core's Filter button names itself "Filter" while it shows
  // the rule count (erxes/erxes#10578).
  await page.getByRole('button', { name: 'Remove filter' }).click();
  await expectAccessible(page);
  await page.goto(ofPipeline);

  // The table's bar deletes both.
  await display(page, 'Table');
  await page.getByRole('checkbox', { name: 'Select all rows' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Delete 2 tickets?');
  await confirmDelete(page);
  await expect(page.getByText('2 tickets deleted')).toBeVisible();
  // The pipeline filter still applies, so the list says nothing matches.
  await expect(page.getByText('No results found')).toBeVisible();
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
}) => {
  const tag = `Urgent ${unique()}`;
  const department = `Care ${unique()}`;
  const property = `Plan ${unique()}`;
  const name = `Invoice ${unique()}`;
  const panel = recordPanel(page);

  await addSetting(page, 'tags', 'Add tag', tag);
  await addSetting(page, 'departments', 'Add department', department);
  await page.goto('/frontline/settings/ticket-properties');
  await page.getByRole('button', { name: 'Add property' }).click();
  await page.getByRole('dialog').getByLabel('Label', { exact: true }).fill(property);
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('row', { name: new RegExp(property) })).toBeVisible();

  const channel = await openChannelPipelines(page);
  const pipeline = await createPipeline(page);

  await page.goto(TICKETS);
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
  await expect(panel.getByText(property)).toBeVisible();
  await expect(panel.getByText('Contacts')).toBeVisible();
  await expectAccessible(page);

  // The filter bar narrows the list by the ticket's tag.
  await page.goto(TICKETS);
  await filterBy(page, 'Pipeline', pipeline);
  await filterBy(page, 'Tags', tag);
  await expect(ticket(page, name)).toBeVisible();
  await page.getByRole('button', { name: 'Remove filter' }).last().click();
  await filterBy(page, 'Department', department);
  await expect(ticket(page, name)).toBeVisible();
});

test('a member without frontline permissions is refused the tickets', async ({ newMember }) => {
  const { page } = await newMember(['team.view']);

  await page.goto(TICKETS);
  await expect(page.getByText('You need the frontline.channel.view permission')).toBeVisible();
  await expectAccessible(page);
});
