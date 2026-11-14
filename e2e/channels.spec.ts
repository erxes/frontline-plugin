import { expect, expectAccessible, test, unique } from './fixtures.ts';

test('the owner creates a channel and adds a teammate, who sees it read-only', async ({
  page,
  newMember,
}) => {
  const name = `Support ${unique()}`;
  const teammate = await newMember(['frontline.channel.view']);

  await page.goto('/frontline');
  await page.getByRole('button', { name: 'Add channel' }).click();
  const sheet = page.getByRole('dialog');

  await sheet.getByLabel('Name').fill(name);
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Save' }).click();

  // The new channel opens with its creator as admin; they add the teammate.
  await expect(sheet.getByRole('heading', { name })).toBeVisible();
  await sheet.getByRole('button', { name: 'Add a member' }).click();
  await page.getByRole('option', { name: teammate.fullName }).click();
  await expect(sheet.getByText(teammate.fullName)).toBeVisible();
  await expectAccessible(page);

  await page.reload();
  await expect(page.getByRole('dialog').getByText(teammate.fullName)).toBeVisible();

  await teammate.page.goto('/frontline');
  await expect(teammate.page.getByRole('button', { name })).toBeVisible();
  await expect(teammate.page.getByRole('button', { name: 'Add channel' })).toBeHidden();
  await expectAccessible(teammate.page);

  await teammate.page.getByRole('button', { name }).click();
  const theirs = teammate.page.getByRole('dialog');

  await expect(theirs.getByRole('heading', { name: 'Members' })).toBeVisible();
  await expect(theirs.getByRole('button', { name: 'Delete channel' })).toBeHidden();
  await expect(theirs.getByLabel('Name')).toBeHidden();
  await expectAccessible(teammate.page);
});

test('a member without frontline permissions is refused', async ({ newMember }) => {
  const { page } = await newMember(['team.view']);

  await page.goto('/frontline');
  await expect(page.getByText('You need the frontline.channel.view permission')).toBeVisible();
  await expectAccessible(page);
});
