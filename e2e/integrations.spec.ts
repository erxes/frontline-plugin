import { expect, expectAccessible, recordPanel, test } from './fixtures.ts';

const INTEGRATIONS = '/frontline/settings/integrations';

// The stack has no Meta app and no real bots, so nothing connects here: the API tests feed each
// provider's recorded payloads through connecting, comments, posts and bots.
test('the owner sees no accounts yet, what Meta’s login reported, and a provider’s refusal', async ({
  page,
}) => {
  await page.goto(INTEGRATIONS);

  await expect(page.getByText('No accounts connected')).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('menuitem', { name: 'Facebook and Instagram' }).click();
  await expect(
    page.getByText('Set META_APP_ID and META_APP_SECRET to connect Facebook and Instagram'),
  ).toBeVisible();

  // A Telegram bot connects by its token, which Telegram checks before anything is saved.
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('menuitem', { name: 'Telegram bot' }).click();

  const panel = recordPanel(page);

  await panel.getByLabel('Bot token').fill('123456:not-a-real-token');
  await expectAccessible(page);
  await panel.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Telegram refused the token');

  // The old Meta page and integration detail links land here.
  await page.goto('/frontline/settings/meta?connected=2');
  await expect(page).toHaveURL(new RegExp(`${INTEGRATIONS}$`));
  await page.goto(`${INTEGRATIONS}?connected=2`);
  await expect(page.getByText('Connected 2 pages')).toBeVisible();

  await page.goto(`${INTEGRATIONS}?error=Meta did not finish the login`);
  await expect(page.getByRole('alert').getByText('Meta did not finish the login')).toBeVisible();

  await page.goto('/frontline/details/channel-1/telegram');
  await expect(page).toHaveURL(new RegExp(`${INTEGRATIONS}$`));
});

test('a member without the integrations permission is refused', async ({ newMember }) => {
  const { page } = await newMember(['frontline.channel.view']);

  await page.goto(INTEGRATIONS);
  await expect(page.getByText('You need the frontline.integration.view permission')).toBeVisible();
});
