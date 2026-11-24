import {
  addMessenger,
  createChannel,
  expect,
  expectAccessible,
  INBOX,
  messengerApi,
  pick,
  recordPanel,
  test,
  unique,
} from './fixtures.ts';
import { cardOf, channelSections } from './channelSettings.ts';

/** A frontline integration's accounts, on its page in core's Settings › Integrations. */
const ACCOUNTS = (key: string) => `/settings/integrations/frontline.${key}?tab=accounts`;

// The stack has no Facebook connection and no real bots, so nothing connects here: the API tests
// feed each provider's recorded payloads through connecting, comments, posts and bots.
test('each provider connects its accounts on its own Integrations page, Facebook through core’s connection', async ({
  page,
}) => {
  const panel = recordPanel(page);

  // Facebook and Instagram has no tile: its old address opens its tab on core's Facebook page.
  // With no Facebook connection there, Add pages leads to that page's own Connect.
  await page.goto(ACCOUNTS('meta'));
  await expect(page).toHaveURL(
    /\/settings\/integrations\/facebook\?tab=frontline\.meta\.accounts$/,
  );
  await page.getByRole('button', { name: 'Add pages', exact: true }).click();

  const toCore = panel.getByRole('link', {
    name: 'Connect Facebook in Settings › Integrations › Facebook',
  });

  await expectAccessible(page, toCore);
  await toCore.click();
  await expect(page).toHaveURL(/\/settings\/integrations\/facebook$/);

  // A Telegram bot connects by its token, which Telegram checks before anything is saved.
  await page.goto(ACCOUNTS('telegram'));
  await page.getByRole('button', { name: 'Connect', exact: true }).click();

  await panel.getByLabel('Bot token').fill('123456:not-a-real-token');
  await panel.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Telegram refused the token');

  // Frontline's old accounts page and integration links open its channels.
  await page.goto('/frontline/settings/accounts');
  await expect(page).toHaveURL(/\/frontline\/settings\/channels$/);
});

const META_TILE = '/settings/integrations/facebook?tab=frontline.meta.accounts';

test('a member without Frontline’s integration management gets core’s Facebook page without its tab', async ({
  newMember,
}) => {
  const { page } = await newMember(['integrations.manage', 'frontline.integration.view']);

  // The old address finds no integration of theirs, so it opens the catalog.
  await page.goto(ACCOUNTS('meta'));
  await expect(page).toHaveURL(/\/settings\/integrations$/);

  // Core's Facebook page is core's to show; Frontline's tab and Add pages are not there.
  await page.goto(META_TILE);
  await expect(page.getByRole('heading', { name: 'Facebook Pages', level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Frontline' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add pages', exact: true })).toBeHidden();
});

test('an admin sets up the messenger on its settings page and visitors get it', async ({
  page,
  plugin,
  request,
}) => {
  const channel = await createChannel(page);
  const title = `Hello from ${unique()}`;

  await page.goto(INBOX);

  const key = await addMessenger(page, channel);
  const settingsUrl = page.url();
  const panel = recordPanel(page);

  // The channel's settings list the messenger under Integrations, with a link to its settings.
  await page.goto('/frontline/settings/channels');
  await page.getByRole('link', { name: channel, exact: true }).click();
  await channelSections(page).getByRole('link', { name: 'Integrations' }).click();
  await page.getByRole('link', { name: /^Settings of Website / }).click();
  await expect(page).toHaveURL(settingsUrl);

  // Archived, it takes no visitors until an admin unarchives it.
  await page.goto(`${INBOX}?panel=/detail/frontline:integration/${settingsUrl.split('/').pop()}`);
  await panel.getByRole('button', { name: 'Integration actions' }).click();
  await page.getByRole('option', { name: 'Archive' }).click();
  await expect(panel.getByText('Archived', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Integration actions' }).click();
  await page.getByRole('option', { name: 'Unarchive' }).click();
  await expect(panel.getByText('Active', { exact: true })).toBeVisible();

  // The messenger's own panel leads back to the settings page too.
  await panel.getByRole('link', { name: 'Look, hours and install code' }).click();
  await expect(page).toHaveURL(settingsUrl);
  await expect(page.getByRole('textbox', { name: 'Welcome message' })).toHaveValue(
    'Hi, how can we help?',
  );
  const install = page.getByText(`/widget/messenger.js?key=${key}"></script>`);

  await expect(install).toBeVisible();
  // Its copy button copies the code and leaves it in place.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await install.locator('..').getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByText('Copied', { exact: true })).toBeVisible();
  await expect(install).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`key=${key}`);

  // The secret the website signs visitors with: made, then rotated after a confirm.
  const secret = page.getByLabel('Messenger identity secret');

  await page.getByRole('button', { name: 'Make a secret' }).click();
  await expect(secret).toHaveText(/^[\w-]{43}$/);

  const first = await secret.textContent();

  await page.getByRole('button', { name: 'Rotate secret' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Rotate secret' }).click();
  await expect(secret).not.toHaveText(first ?? '');

  // Each change shows in the preview, the real widget in a frame, before it saves.
  const preview = page.frameLocator('iframe[title="Messenger preview"]');

  await page.getByRole('textbox', { name: 'Greeting title' }).fill(title);
  await expect(preview.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: 'Teal', exact: true }).click();
  await pick(page, page.getByRole('combobox', { name: 'Set availability' }), 'By online hours');
  await page.getByRole('button', { name: 'Add hours' }).click();
  await page.getByRole('switch', { name: 'Ask for an email or phone' }).click();
  await page.getByRole('textbox', { name: 'Bot greeting' }).fill('I am the bot. Ask me anything.');
  await preview.getByRole('button', { name: 'Send us a message' }).click();
  await expect(preview.getByText('I am the bot. Ask me anything.')).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Back' })).toBeVisible();
  // Online hours and the bot's fields show only once switched on.
  await expectAccessible(page, page.getByRole('button', { name: 'Add hours' }));
  // A website page with no address marks that field instead of saving.
  await page.getByRole('button', { name: 'Add page' }).click();
  await page.getByRole('textbox', { name: 'Button text' }).fill('Docs');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Enter the address, starting with https://')).toBeVisible();
  await page.getByRole('textbox', { name: 'Page address' }).click();
  await page.keyboard.type('https://example.com/docs');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Messenger saved')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Greeting title' })).toHaveValue(title);
  await expect(page.getByRole('combobox', { name: 'Set availability' })).toContainText(
    'By online hours',
  );

  const connected = await request.post(`${messengerApi(plugin)}/connect`, { data: { key } });

  expect(await connected.json()).toMatchObject({
    messenger: { greetingTitle: title, color: '#0F766E', requireAuth: true },
  });
});

test("a channel's settings list its integrations, and its admins add more there", async ({
  page,
}) => {
  const channel = await createChannel(page);

  await page.goto(INBOX);
  await addMessenger(page, channel);

  await page.goto('/frontline/settings/channels');
  await page.getByRole('link', { name: channel, exact: true }).click();
  await channelSections(page).getByRole('link', { name: 'Integrations' }).click();

  const messenger = page.getByRole('link', { name: /^Settings of Website / });

  await expect(messenger).toBeVisible();
  await expectAccessible(page, messenger);

  // A card per kind: the messenger counts the one the channel has, the rest have none. Telegram
  // opens inside the channel, and its bots connect in core's Integrations.
  const catalog = page.getByRole('list', { name: 'Kinds of integration' });

  await expect(cardOf(page, 'Website messenger')).toContainText('1 in this channel');
  await expect(cardOf(page, 'Telegram')).toContainText('None yet');
  await expectAccessible(page, catalog);
  await cardOf(page, 'Telegram').getByRole('link').click();
  await expect(page).toHaveURL(/\/frontline\/settings\/channels\/[^/]+\/integrations\/telegram$/);
  await page.getByRole('link', { name: 'Connect in Integrations' }).click();
  await expect(page).toHaveURL(/\/settings\/integrations\/frontline\.telegram\?tab=accounts$/);

  // Frontline's settings hold no list of every integration: the old address opens the channels.
  await page.goto('/frontline/settings/integrations');
  await expect(page).toHaveURL(/\/frontline\/settings\/channels$/);
});

test('a member without the integrations permission never reaches their accounts', async ({
  newMember,
}) => {
  const { page } = await newMember(['frontline.channel.view']);

  // Core sends them on to the settings they may open.
  await page.goto(ACCOUNTS('telegram'));
  await expect(page).not.toHaveURL(/frontline\.telegram/);
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeHidden();
});
