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
  await pick(page, page.getByRole('combobox', { name: 'Priority', exact: true }), 'Medium');
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
  await expect(page.getByText('No tickets yet')).toBeVisible();
  await display(page, 'List');
});

test('a member without frontline permissions is refused the tickets', async ({ newMember }) => {
  const { page } = await newMember(['team.view']);

  await page.goto(TICKETS);
  await expect(page.getByText('You need the frontline.channel.view permission')).toBeVisible();
  await expectAccessible(page);
});
