import { coreClient, expect, expectAccessible, test, unique } from './fixtures.ts';

test('the owner adds an item and finds it after a reload', async ({ page }) => {
  const name = `Item ${unique()}`;

  await page.goto('/frontline');
  await expect(page.getByRole('button', { name: 'Add item' })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Add item' }).click();
  const sheet = page.getByRole('dialog');

  await sheet.getByLabel('Name').fill(name);
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();

  await page.reload();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
  await expectAccessible(page);
});

test('a member without frontline permissions is refused', async ({
  api,
  browser,
  baseURL,
  colorScheme,
}) => {
  const suffix = unique();

  const role = await api.roles.create({
    name: `No frontline ${suffix}`,
    permissions: ['team.view'],
  });

  const member = { email: `nofront-${suffix}@e2e.test`, password: 'Nofront-pass-12345' };

  await api.users.invite({ ...member, role: role.key, fullName: 'Nora Nofront' });

  const context = await browser.newContext({ baseURL, colorScheme });
  const page = await context.newPage();
  const asMember = coreClient(page.request, baseURL);

  await asMember.auth.signIn(member);
  await asMember.auth.onboarded({ language: 'en' });

  await page.goto('/frontline');
  await expect(page.getByText('You need the frontline.item.view permission')).toBeVisible();
  await expectAccessible(page);
  await context.close();
});
