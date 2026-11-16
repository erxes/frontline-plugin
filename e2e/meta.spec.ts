import { expect, expectAccessible, test } from './fixtures.ts';

const META = '/frontline/settings/meta';

// The stack has no Meta app, so no page can connect here: the API tests feed Meta's recorded
// payloads through connecting, comments, posts and bots.
test('the owner sees no pages yet, and what Meta’s login reported', async ({ page }) => {
  await page.goto(META);

  await expect(page.getByText('No pages connected')).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Connect Facebook' }).first().click();
  await expect(
    page.getByText('Set META_APP_ID and META_APP_SECRET to connect Facebook and Instagram'),
  ).toBeVisible();

  await page.goto(`${META}?connected=2`);
  await expect(page.getByText('Connected 2 pages')).toBeVisible();

  await page.goto(`${META}?error=Meta did not finish the login`);
  await expect(page.getByRole('alert').getByText('Meta did not finish the login')).toBeVisible();
});

test('a member without the integrations permission is refused', async ({ newMember }) => {
  const { page } = await newMember(['frontline.channel.view']);

  await page.goto(META);
  await expect(page.getByText('You need the frontline.integration.view permission')).toBeVisible();
});
