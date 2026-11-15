import type { Page } from '@playwright/test';
import {
  createPipeline,
  expect,
  expectAccessible,
  openChannelPipelines,
  test,
  unique,
} from './fixtures.ts';

/** Picks `option` in the select `name` labels. */
const pick = async (page: Page, name: string, option: string) => {
  await page.getByRole('combobox', { name, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
};

/** Opens the create sheet with C and creates a ticket in `pipeline` of `channel`, then opens it. */
const createTicket = async (
  page: Page,
  { channel, pipeline, name }: { channel: string; pipeline: string; name: string },
) => {
  const sheet = page.getByRole('dialog', { name: 'Create ticket' });

  await page.goto('/frontline/tickets');
  await expect(page.getByRole('button', { name: /Create ticket/ }).first()).toBeVisible();
  await page.keyboard.press('c');
  await pick(page, 'Channel', channel);
  await pick(page, 'Pipeline', pipeline);
  await sheet.getByLabel('Name').fill(name);
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
};

test('a member files, filters, changes and deletes tickets from the list and the board', async ({
  page,
  newMember,
}) => {
  const teammate = await newMember(['frontline.channel.view']);
  const channel = await openChannelPipelines(page, teammate.fullName);
  const pipeline = await createPipeline(page);
  const refund = `Refund ${unique()}`;
  const login = `Login ${unique()}`;

  await createTicket(page, { channel, pipeline, name: refund });
  await expectAccessible(page);
  await pick(page, `Priority of ${refund}`, 'High');
  await expect(page.getByRole('combobox', { name: `Priority of ${refund}` })).toHaveText('High');
  await createTicket(page, { channel, pipeline, name: login });

  // The filters live in the address, so a reload keeps them.
  await page.getByRole('link', { name: 'Tickets' }).first().click();
  await pick(page, 'Channel', channel);
  await pick(page, 'Priority', 'High');
  await expect(page).toHaveURL(/priority=3/);
  await page.reload();
  await expect(page.getByRole('link', { name: refund })).toBeVisible();
  await expect(page.getByRole('link', { name: login })).toBeHidden();
  await expectAccessible(page);
  await pick(page, 'Priority', 'All priorities');
  await expect(page.getByRole('link', { name: login })).toBeVisible();

  // A member of the channel changes tickets but can't delete them.
  await teammate.page.goto('/frontline/tickets');
  await teammate.page.getByRole('button', { name: `Actions for ${login}` }).click();
  await expect(teammate.page.getByRole('option', { name: 'Archive' })).toBeVisible();
  await expect(teammate.page.getByRole('option', { name: 'Delete' })).toBeHidden();
  await teammate.page.keyboard.press('Escape');
  await expectAccessible(teammate.page);

  // The selection's bar changes both tickets in one go.
  await page.getByRole('checkbox', { name: 'Select all rows' }).check();
  await page.getByRole('button', { name: 'Priority', exact: true }).click();
  await page.getByRole('option', { name: 'Medium' }).click();
  await expect(page.getByRole('combobox', { name: `Priority of ${login}` })).toHaveText('Medium');
  await expect(page.getByRole('combobox', { name: `Priority of ${refund}` })).toHaveText('Medium');

  // The board shows the pipeline's statuses as columns.
  await pick(page, 'Pipeline', pipeline);
  await page.getByRole('button', { name: 'Board' }).click();
  await expect(page.getByRole('region', { name: 'New' })).toContainText(refund);
  await expectAccessible(page);
  await page.getByRole('button', { name: 'List' }).click();

  await page.getByRole('checkbox', { name: 'Select all rows' }).check();
  await page.getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('alertdialog');

  await expect(confirm).toContainText('Are you sure you want to delete the 2 selected tickets?');
  await confirm.getByRole('textbox').fill('delete');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Ticket deleted successfully')).toBeVisible();
  await expect(page.getByText('No tickets yet')).toBeVisible();
});

test('a member without frontline permissions is refused the tickets', async ({ newMember }) => {
  const { page } = await newMember(['team.view']);

  await page.goto('/frontline/tickets');
  await expect(page.getByText('You need the frontline.channel.view permission')).toBeVisible();
  await expectAccessible(page);
});
