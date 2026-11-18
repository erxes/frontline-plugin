import type { Page } from '@playwright/test';
import { confirmDelete, expect, test, unique } from './fixtures.ts';

const SETTINGS = '/frontline/settings';

/** Opens the page's Add sheet with `button`, fills its Name and creates the row. */
const addNamed = async (page: Page, button: string, name: string) => {
  await page.getByRole('button', { name: button }).click();
  const sheet = page.getByRole('dialog');

  await sheet.getByLabel('Name', { exact: true }).fill(name);

  await sheet.getByRole('button', { name: 'Create' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
};

test('the owner adds, finds and deletes tags', async ({ page }) => {
  const tag = `VIP ${unique()}`;

  await page.goto(`${SETTINGS}/tags`);
  await addNamed(page, 'Add tag', tag);
  // The filter bar's search lives in the address.
  await page.goto(`${SETTINGS}/tags?${new URLSearchParams({ searchValue: tag })}`);
  await expect(page.getByRole('row')).toHaveCount(2);
  await page.getByRole('button', { name: `Actions for ${tag}` }).click();
  await page.getByRole('option', { name: 'Delete' }).click();
  await confirmDelete(page);
  await expect(page.getByRole('row', { name: new RegExp(tag) })).toBeHidden();
});

test('the sidebar opens every Frontline page, and Settings opens its own sidebar', async ({
  page,
}) => {
  const pages = {
    Inbox: '/frontline/inbox',
    Tickets: '/frontline/tickets',
    Forms: '/frontline/forms',
    Surveys: '/frontline/surveys',
    'Knowledge Base': '/frontline/knowledgebase',
    'Help centers': '/frontline/help-centers',
    History: '/frontline/calls/history',
    Queues: '/frontline/calls/queues',
  };

  const settings = {
    Tags: `${SETTINGS}/tags`,
    Integrations: `${SETTINGS}/integrations`,
    Channels: `${SETTINGS}/channels`,
  };

  await page.goto('/frontline/tickets');

  for (const [name, path] of Object.entries(pages)) {
    // A link with unread items says how many: "Inbox 12 unread".
    await page.getByRole('link', { name: new RegExp(`^${name}( \\d+ unread)?$`) }).click();
    await expect(page).toHaveURL(new RegExp(`${path}(/|\\?|$)`));
  }

  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(`${SETTINGS}/channels`);

  for (const [name, path] of Object.entries(settings)) {
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(path);
  }

  await page.getByRole('link', { name: 'Exit settings' }).click();
  await expect(page).toHaveURL(/\/frontline\/inbox/);

  // Branches, departments and ticket properties are core's, edited in its own settings. An old
  // link stays in frontline's settings, so the app's tab never keeps a page that leaves the app.
  await page.goto(`${SETTINGS}/departments`);
  await expect(page).toHaveURL(`${SETTINGS}/channels`);
  await page.getByRole('link', { name: 'Branches and departments', exact: true }).click();
  await expect(page).toHaveURL('/settings/structure');

  await page.goto(`${SETTINGS}/ticket-properties`);
  await expect(page).toHaveURL(`${SETTINGS}/channels`);
  await page.getByRole('link', { name: 'Ticket properties', exact: true }).click();
  await expect(page).toHaveURL('/settings/properties/frontline.ticket');

  // A record's address without its id opens the channels, not a blank page.
  await page.goto(`${SETTINGS}/response-templates`);
  await expect(page).toHaveURL(`${SETTINGS}/channels`);
  await expect(page.getByRole('button', { name: 'Create channel' })).toBeVisible();
});

test('a channel member reads the settings, and a member without frontline permissions is refused', async ({
  page,
  newMember,
}) => {
  const tag = `Billing ${unique()}`;
  const reader = await newMember(['frontline.channel.view']);
  const stranger = await newMember(['team.view']);

  await page.goto(`${SETTINGS}/tags`);
  await addNamed(page, 'Add tag', tag);

  await reader.page.goto(`${SETTINGS}/tags`);
  await expect(reader.page.getByRole('row', { name: new RegExp(tag) })).toBeVisible();
  await expect(reader.page.getByRole('button', { name: 'Add tag' })).toBeHidden();
  await expect(reader.page.getByRole('button', { name: `Actions for ${tag}` })).toBeHidden();

  await stranger.page.goto(`${SETTINGS}/tags`);
  await expect(
    // Tags label conversations too, so the inbox's readers read them.
    stranger.page.getByText(
      'You need the frontline.channel.view or frontline.inbox.view permission',
    ),
  ).toBeVisible();
});
