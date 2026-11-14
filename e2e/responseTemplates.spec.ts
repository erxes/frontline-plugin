import { expect, expectAccessible, test, unique } from './fixtures.ts';

test("a channel admin writes, edits and deletes the channel's response templates", async ({
  page,
  newMember,
}) => {
  const channel = `Support ${unique()}`;
  const teammate = await newMember(['frontline.channel.view']);

  await page.goto('/frontline/settings/channels?channel=new');
  await page.getByRole('dialog').getByLabel('Name').fill(channel);
  await page.getByRole('dialog').getByPlaceholder('Search members').fill(teammate.fullName);
  await page.getByRole('dialog').getByRole('option', { name: teammate.fullName }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: /response templates/i }).click();

  await expect(page.getByText('No responses yet')).toBeVisible();
  await page.getByRole('button', { name: 'Create response template' }).first().click();
  const sheet = page.getByRole('dialog');

  await sheet.getByLabel('Name').fill('Greeting');

  // Closing the panel keeps the draft.
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await page.getByRole('button', { name: 'Create response template' }).first().click();
  await expect(sheet.getByLabel('Name')).toHaveValue('Greeting');

  await sheet.getByRole('textbox', { name: 'Content' }).fill('Hello, thanks for writing to us.');
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Create' }).click();

  const row = page.getByRole('row', { name: /Greeting/ });

  await expect(row).toBeVisible();
  await expect(page.getByText('1 records found')).toBeVisible();
  await expectAccessible(page);

  await row.getByRole('button', { name: 'Greeting', exact: true }).click();
  await expect(sheet.getByText('Hello, thanks for writing to us.')).toBeVisible();
  await sheet.getByLabel('Name').fill('Welcome');
  await sheet.getByRole('button', { name: 'Update' }).click();
  await expect(page.getByRole('row', { name: /Welcome/ })).toBeVisible();

  // A member of the channel reads its templates and can't change them.
  await teammate.page.goto(page.url());
  await expect(teammate.page.getByRole('button', { name: 'Welcome', exact: true })).toBeVisible();
  await expect(
    teammate.page.getByRole('button', { name: 'Create response template' }),
  ).toBeHidden();
  await expect(teammate.page.getByRole('button', { name: 'Actions for Welcome' })).toBeHidden();
  await expectAccessible(teammate.page);

  await page.getByRole('button', { name: 'Actions for Welcome' }).click();
  await page.getByRole('option', { name: 'Delete' }).click();
  const confirm = page.getByRole('alertdialog');

  await confirm.getByRole('textbox').fill('delete');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No responses yet')).toBeVisible();
});
