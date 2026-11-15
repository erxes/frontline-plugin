import { expect, expectAccessible, test, unique } from './fixtures.ts';

test('the owner creates a channel with a teammate, who sees it read-only', async ({
  page,
  newMember,
}) => {
  const name = `Support ${unique()}`;
  const teammate = await newMember(['frontline.channel.view']);

  // The app opens on its tickets, as the old plugin did; the sidebar's foot leads to the settings.
  await page.goto('/frontline');
  await expect(page).toHaveURL(/\/frontline\/tickets$/);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/frontline\/settings\/channels$/);
  await page.getByRole('button', { name: 'Create channel' }).click();
  const sheet = page.getByRole('dialog');

  await sheet.getByLabel('Name').fill(name);
  await sheet.getByPlaceholder('Search members').fill(teammate.fullName);
  await sheet.getByRole('option', { name: teammate.fullName }).click();
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Create' }).click();

  // The new channel opens on its own page; its members are the creator, as admin, and the teammate.
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await page.getByRole('link', { name: /Manage channel members/ }).click();
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(teammate.fullName) })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Role: Admin' })).toBeVisible();
  await expectAccessible(page);

  // A second channel with the same name is refused, and the form keeps what was typed.
  await page.goto('/frontline/settings/channels?channel=new');
  await sheet.getByLabel('Name').fill(name);
  await sheet.getByRole('button', { name: 'Create' }).click();
  await expect(sheet.getByText(`Another channel is already called ${name}.`)).toBeVisible();
  await expect(sheet.getByLabel('Name')).toHaveValue(name);

  await teammate.page.goto('/frontline/settings/channels');
  await expect(teammate.page.getByRole('link', { name })).toBeVisible();
  await expect(teammate.page.getByRole('button', { name: 'Create channel' })).toBeHidden();
  await expectAccessible(teammate.page);

  await teammate.page.getByRole('link', { name }).click();
  await expect(teammate.page.getByRole('heading', { name })).toBeVisible();
  await expect(teammate.page.getByRole('button', { name: 'Edit' })).toBeHidden();
  await teammate.page.getByRole('link', { name: /Manage channel members/ }).click();
  await expect(teammate.page.getByRole('heading', { name: 'Members' })).toBeVisible();
  await expect(teammate.page.getByRole('button', { name: 'Add members' })).toBeHidden();
  await expectAccessible(teammate.page);
});

test('the owner adds a member, removes them, and cannot remove the last admin', async ({
  page,
  newMember,
}) => {
  const name = `Billing ${unique()}`;
  const teammate = await newMember(['frontline.channel.view']);

  await page.goto('/frontline/settings/channels?channel=new');
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: /Manage channel members/ }).click();

  await page.getByRole('button', { name: 'Add members' }).click();
  const sheet = page.getByRole('dialog');

  await sheet.getByPlaceholder('Search members').fill(teammate.fullName);
  await sheet.getByRole('option', { name: teammate.fullName }).click();
  await sheet.getByRole('button', { name: 'Add members' }).click();
  const row = page.getByRole('row', { name: new RegExp(teammate.fullName) });

  await expect(row).toBeVisible();
  await expectAccessible(page);

  await row.getByRole('button', { name: 'Member actions' }).click();
  await page.getByRole('option', { name: 'Remove' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
  await expect(row).toBeHidden();

  // The owner is the only admin left, so the API refuses to remove them.
  await page.getByRole('button', { name: 'Member actions' }).click();
  await page.getByRole('option', { name: 'Remove' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Could not save the change')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Role: Admin' })).toBeVisible();
});

test('a member without frontline permissions is refused', async ({ newMember }) => {
  const { page } = await newMember(['team.view']);

  await page.goto('/frontline/settings/channels');
  await expect(page.getByText('You need the frontline.channel.view permission')).toBeVisible();
  await expectAccessible(page);
});
