import { expect, expectAccessible, newRecordPath, recordPanel, test, unique } from './fixtures.ts';

const CHANNELS = '/frontline/settings/channels';

test('the owner creates a channel with a teammate, who sees it read-only', async ({
  page,
  newMember,
}) => {
  const name = `Support ${unique()}`;
  const teammate = await newMember(['frontline.channel.view']);
  const panel = recordPanel(page);

  await page.goto('/frontline');
  await expect(page).toHaveURL(/\/frontline\/settings\/channels$/);
  await page.getByRole('button', { name: 'Create channel' }).click();

  await panel.getByLabel('Name').fill(name);
  await panel.getByPlaceholder('Search members').fill(teammate.fullName);
  await panel.getByRole('option', { name: teammate.fullName }).click();
  await expectAccessible(page);
  await panel.getByRole('button', { name: 'Create channel' }).click();

  // The draft becomes the channel, its name edited in place; its members are the creator, as
  // admin, and the teammate.
  await expect(panel.getByRole('button', { name })).toBeEnabled();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
  await panel.getByRole('link', { name: /Manage channel members/ }).click();
  await expect(page).toHaveURL(/\/members$/);
  await expect(page.getByRole('row', { name: new RegExp(teammate.fullName) })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Role: Admin' })).toBeVisible();
  await expectAccessible(page);

  // A second channel with the same name is refused, and the form keeps what was typed.
  await page.goto(newRecordPath(CHANNELS, 'frontline:channel'));
  await panel.getByLabel('Name').fill(name);
  await panel.getByRole('button', { name: 'Create channel' }).click();
  await expect(panel.getByText(`Another channel is already called ${name}.`)).toBeVisible();
  await expect(panel.getByLabel('Name')).toHaveValue(name);

  const theirPanel = recordPanel(teammate.page);

  await teammate.page.goto('/frontline');
  await expect(teammate.page.getByRole('button', { name: 'Create channel' })).toBeHidden();
  await teammate.page.getByRole('button', { name, exact: true }).click();
  await expect(theirPanel.getByRole('button', { name })).toBeDisabled();
  await expect(theirPanel.getByRole('button', { name: 'Channel actions' })).toBeHidden();
  await expectAccessible(teammate.page);

  await theirPanel.getByRole('link', { name: /Manage channel members/ }).click();
  // Without core's team.view the teammate can't read names, but sees both members and their roles.
  await expect(teammate.page.getByRole('row')).toHaveCount(3);
  await expect(teammate.page.getByRole('cell', { name: 'Member', exact: true })).toBeVisible();
  await expect(teammate.page.getByRole('button', { name: 'Add members' })).toBeHidden();
  await expectAccessible(teammate.page);
});

test('the owner renames a channel, adds a member, removes them, and cannot remove the last admin', async ({
  page,
  newMember,
}) => {
  const name = `Billing ${unique()}`;
  const renamed = `${name} desk`;
  const teammate = await newMember(['frontline.channel.view']);
  const panel = recordPanel(page);

  await page.goto(newRecordPath(CHANNELS, 'frontline:channel'));
  await panel.getByLabel('Name').fill(name);
  await panel.getByRole('button', { name: 'Create channel' }).click();

  await panel.getByRole('button', { name }).click();
  await page.getByPlaceholder('Name').fill(renamed);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('row', { name: new RegExp(renamed) })).toBeVisible();

  await panel.getByRole('link', { name: /Manage channel members/ }).click();
  await page.getByRole('button', { name: 'Add members' }).click();
  const popover = page.getByRole('dialog');

  await popover.getByPlaceholder('Search members').fill(teammate.fullName);
  await popover.getByRole('option', { name: teammate.fullName }).click();
  await popover.getByRole('button', { name: 'Add members' }).click();
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

  await page.goto('/frontline');
  await expect(page.getByText('You need the frontline.channel.view permission')).toBeVisible();
  await expectAccessible(page);
});
