import type { Page } from '@playwright/test';
import { confirmDelete, expect, expectAccessible, test, unique } from './fixtures.ts';

const SETTINGS = '/frontline/settings';

/** Opens the page's Add sheet with `button`, fills its Name and creates the row. */
const addNamed = async (page: Page, button: string, name: string) => {
  await page.getByRole('button', { name: button }).click();
  const sheet = page.getByRole('dialog');

  await sheet.getByLabel('Name', { exact: true }).fill(name);
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Create' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
};

test('the owner adds, finds and deletes tags, departments, branches and ticket properties', async ({
  page,
}) => {
  const tag = `VIP ${unique()}`;
  const department = `Care ${unique()}`;
  const branch = `North ${unique()}`;
  const property = `Plan ${unique()}`;

  await page.goto(`${SETTINGS}/tags`);
  await addNamed(page, 'Add tag', tag);
  await page.getByPlaceholder('Search').fill(tag);
  await expect(page.getByRole('row')).toHaveCount(2);
  await expectAccessible(page);
  await page.getByRole('button', { name: `Actions for ${tag}` }).click();
  await page.getByRole('option', { name: 'Delete' }).click();
  await confirmDelete(page);
  await expect(page.getByRole('row', { name: new RegExp(tag) })).toBeHidden();

  await page.goto(`${SETTINGS}/departments`);
  await addNamed(page, 'Add department', department);
  await expect(page.getByRole('row', { name: new RegExp(department) })).toContainText('Nobody');
  await expectAccessible(page);

  await page.goto(`${SETTINGS}/branches`);
  await addNamed(page, 'Add branch', branch);
  // Branches and departments are listed apart.
  await expect(page.getByRole('row', { name: new RegExp(department) })).toBeHidden();
  await expectAccessible(page);

  await page.goto(`${SETTINGS}/ticket-properties`);
  await page.getByRole('button', { name: 'Add property' }).click();
  const sheet = page.getByRole('dialog');

  await sheet.getByLabel('Label', { exact: true }).fill(property);
  await sheet.getByRole('combobox', { name: 'Type' }).click();
  await page.getByRole('option', { name: 'One choice' }).click();
  await sheet.getByPlaceholder('Add a choice').fill('Gold');
  await sheet.getByPlaceholder('Add a choice').press('Enter');
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('row', { name: new RegExp(property) })).toContainText('One choice');
  await expect(page.getByRole('row', { name: new RegExp(property) })).toContainText(
    'Every pipeline',
  );
  await expectAccessible(page);
});

test('a channel member reads the settings, and a member without frontline permissions is refused', async ({
  page,
  newMember,
}) => {
  const tag = `Billing ${unique()}`;
  const reader = await newMember(['frontline.channel.view']);
  const stranger = await newMember(['team.view']);

  await page.goto(`${SETTINGS}/tags`);
  await addNamed(page, 'Add tag', tag);

  await reader.page.goto(`${SETTINGS}/tags`);
  await expect(reader.page.getByRole('row', { name: new RegExp(tag) })).toBeVisible();
  await expect(reader.page.getByRole('button', { name: 'Add tag' })).toBeHidden();
  await expect(reader.page.getByRole('button', { name: `Actions for ${tag}` })).toBeHidden();
  await expectAccessible(reader.page);

  await stranger.page.goto(`${SETTINGS}/ticket-properties`);
  await expect(
    stranger.page.getByText('You need the frontline.channel.view permission'),
  ).toBeVisible();
  await expectAccessible(stranger.page);
});
