import { expect, expectAccessible, recordPanel, test } from './fixtures.ts';

const INTEGRATIONS = '/frontline/settings/integrations';

// The stack has no Meta app and no real bots, so nothing connects here: the API tests feed each
// provider's recorded payloads through connecting, comments, posts and bots.
test('the owner sees the accounts page, what Meta’s login reported, and a provider’s refusal', async ({
  page,
}) => {
  await page.goto(INTEGRATIONS);

  // Other specs connect phone lines in the same organisation, so the list may not be empty.
  await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible();

  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('menuitem', { name: 'Facebook and Instagram' }).click();
  await expect(
    page.getByText(
      'Set your Meta app in Settings › Integrations › Meta to connect Facebook and Instagram',
    ),
  ).toBeVisible();

  // A Telegram bot connects by its token, which Telegram checks before anything is saved.
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('menuitem', { name: 'Telegram bot' }).click();

  const panel = recordPanel(page);

  await panel.getByLabel('Bot token').fill('123456:not-a-real-token');

  await panel.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Telegram refused the token');

  // The old Meta page and integration detail links land here.
  await page.goto('/frontline/settings/meta?connected=2');
  await expect(page).toHaveURL(new RegExp(`${INTEGRATIONS}$`));
  await page.goto(`${INTEGRATIONS}?connected=2`);
  await expect(page.getByText('Connected 2 pages')).toBeVisible();

  await page.goto(`${INTEGRATIONS}?error=Meta did not finish the login`);
  await expect(page.getByRole('alert').getByText('Meta did not finish the login')).toBeVisible();

  await page.goto('/frontline/settings/channels/details/channel-1/telegram');
  await expect(page).toHaveURL(new RegExp(`${INTEGRATIONS}$`));
});

const META_TILE = '/settings/integrations/frontline.meta';

// Saving an app would send every later Connect to Meta's real login, so this stops at the check.
test("the Meta tile on core's Integrations asks for the organisation's app", async ({ page }) => {
  await page.goto(META_TILE);

  await expect(page.getByText('Set a Meta app before you connect')).toBeVisible();
  await expect(page.getByText(/\/api\/public\/webhooks\/meta$/)).toBeVisible();
  await expect(page.getByText(/\/api\/public\/webhooks\/meta\/callback$/)).toBeVisible();

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Enter the app id')).toBeVisible();
  await expect(page.getByText('Enter the app secret')).toBeVisible();
  await expect(page.getByText('Enter a verify token')).toBeVisible();
  await expectAccessible(page, page.getByLabel('Verify token'));
});

test('a member without integration management never reaches the Meta tile', async ({
  newMember,
}) => {
  const { page } = await newMember(['integrations.manage', 'frontline.integration.view']);

  await page.goto(META_TILE);
  await expect(page).toHaveURL(/\/settings\/integrations$/);
  await expect(page.getByText('Set a Meta app before you connect')).toBeHidden();
});

test('a member without the integrations permission is refused', async ({ newMember }) => {
  const { page } = await newMember(['frontline.channel.view']);

  await page.goto(INTEGRATIONS);
  await expect(page.getByText('You need the frontline.integration.view permission')).toBeVisible();
});
