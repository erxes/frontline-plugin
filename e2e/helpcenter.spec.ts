import { confirmDelete, expect, expectAccessible, recordPanel, test, unique } from './fixtures.ts';

const HELP_CENTERS = '/frontline/settings/help-centers';

test('the owner creates a help center, edits it, sees its domain tab and deletes it', async ({
  page,
}) => {
  const title = `Help ${unique()}`;
  const renamed = `${title} desk`;
  const panel = recordPanel(page);

  // The old address leads to the list.
  await page.goto('/frontline/helpcenter');
  await expect(page).toHaveURL(new RegExp(`${HELP_CENTERS}$`));
  await page.getByRole('button', { name: 'Add help center' }).click();
  await panel.getByLabel('Title').fill(title);
  await expectAccessible(page);
  await panel.getByRole('button', { name: 'Create help center' }).click();

  // It opens edited in place, with the public key its site is found by.
  await expect(panel.getByText('Public key')).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(title) })).toBeVisible();
  await panel.getByRole('button', { name: title }).first().click();
  await page.getByPlaceholder('Title').fill(renamed);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('row', { name: new RegExp(renamed) })).toBeVisible();
  await expect(panel.getByText('Look')).toBeVisible();
  await expectAccessible(page);

  // The e2e stack has no Cloudflare settings, so the domain tab says so.
  await panel.getByRole('tab', { name: 'Domain' }).click();
  await expect(
    panel.getByText('Custom domains are not available on this installation.'),
  ).toBeVisible();
  await expectAccessible(page);

  await panel.getByRole('button', { name: 'Help center actions' }).click();
  await page.getByRole('option', { name: 'Delete' }).click();
  await confirmDelete(page);
  await expect(page.getByRole('row', { name: new RegExp(renamed) })).toBeHidden();
});

test('a reader sees help centers read-only, and a member without the permission is refused', async ({
  page,
  newMember,
}) => {
  const title = `Docs ${unique()}`;
  const reader = await newMember(['frontline.help_center.view']);
  const stranger = await newMember(['frontline.channel.view']);
  const panel = recordPanel(page);

  await page.goto(HELP_CENTERS);
  await page.getByRole('button', { name: 'Add help center' }).click();
  await panel.getByLabel('Title').fill(title);
  await panel.getByRole('button', { name: 'Create help center' }).click();
  await expect(page.getByRole('row', { name: new RegExp(title) })).toBeVisible();

  const theirPanel = recordPanel(reader.page);

  await reader.page.goto(HELP_CENTERS);
  await expect(reader.page.getByRole('button', { name: 'Add help center' })).toBeHidden();
  await reader.page.getByRole('button', { name: title, exact: true }).click();
  await expect(theirPanel.getByRole('button', { name: title }).first()).toBeDisabled();
  await expect(theirPanel.getByRole('button', { name: 'Help center actions' })).toBeHidden();
  await expectAccessible(reader.page);

  await stranger.page.goto(HELP_CENTERS);
  await expect(
    stranger.page.getByText('You need the frontline.help_center.view permission'),
  ).toBeVisible();
  await expectAccessible(stranger.page);
});
