import type { Page } from '@playwright/test';
import { confirmDelete, expect, expectPage, test, unique } from './fixtures.ts';

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

test('the owner adds, finds and deletes tags and ticket properties', async ({ page }) => {
  const tag = `VIP ${unique()}`;
  const property = `Plan ${unique()}`;

  await page.goto(`${SETTINGS}/tags`);
  await addNamed(page, 'Add tag', tag);
  // The filter bar's search lives in the address.
  await page.goto(`${SETTINGS}/tags?${new URLSearchParams({ searchValue: tag })}`);
  await expect(page.getByRole('row')).toHaveCount(2);
  await page.getByRole('button', { name: `Actions for ${tag}` }).click();
  await page.getByRole('option', { name: 'Delete' }).click();
  await confirmDelete(page);
  await expect(page.getByRole('row', { name: new RegExp(tag) })).toBeHidden();

  await page.goto(`${SETTINGS}/ticket-properties`);
  await page.getByRole('button', { name: 'Add property' }).click();
  const sheet = page.getByRole('dialog');

  await sheet.getByLabel('Label', { exact: true }).fill(property);
  await sheet.getByRole('combobox', { name: 'Type' }).click();
  await page.getByRole('option', { name: 'One choice' }).click();
  await sheet.getByPlaceholder('Add a choice').fill('Gold');
  await sheet.getByPlaceholder('Add a choice').press('Enter');

  await sheet.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('row', { name: new RegExp(property) })).toContainText('One choice');
  await expect(page.getByRole('row', { name: new RegExp(property) })).toContainText(
    'Every pipeline',
  );
});

test('the sidebar opens every Frontline page, and Settings opens its own sidebar', async ({
  page,
}) => {
  // Each link, its page and the page's heading. Tickets is headed by its first pipeline.
  const pages: [string, string, string?][] = [
    ['Inbox', '/frontline/inbox', 'Inbox'],
    ['Tickets', '/frontline/tickets'],
    ['Forms', '/frontline/forms', 'Forms'],
    ['Surveys', '/frontline/surveys', 'Surveys'],
    ['Knowledge Base', '/frontline/knowledgebase', 'Knowledge Base'],
    ['Help centers', '/frontline/help-centers', 'Help centers'],
    ['History', '/frontline/calls/history', 'Call history'],
    ['Queues', '/frontline/calls/queues', 'Queues'],
  ];

  const settings = {
    Tags: `${SETTINGS}/tags`,
    'Ticket properties': `${SETTINGS}/ticket-properties`,
    Integrations: `${SETTINGS}/integrations`,
    Channels: `${SETTINGS}/channels`,
  };

  await page.goto('/frontline/tickets');

  for (const [name, path, heading] of pages) {
    // A link with unread items says how many: "Inbox 12 unread".
    await page.getByRole('link', { name: new RegExp(`^${name}( \\d+ unread)?$`) }).click();
    await expect(page).toHaveURL(new RegExp(`${path}(/|\\?|$)`));

    if (heading) await expectPage(page, heading);
  }

  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(`${SETTINGS}/channels`);

  for (const [name, path] of Object.entries(settings)) {
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(path);
    await expectPage(page, name);
  }

  await page.getByRole('link', { name: 'Exit settings' }).click();
  await expect(page).toHaveURL(/\/frontline\/inbox/);

  // Branches and departments are core's, edited in its own settings. An old link stays in
  // frontline's settings, so the app's tab never keeps a page that leaves the app.
  await page.goto(`${SETTINGS}/departments`);
  await expect(page).toHaveURL(`${SETTINGS}/channels`);
  await page.getByRole('link', { name: 'Branches and departments', exact: true }).click();
  await expect(page).toHaveURL('/settings/structure');
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

  await stranger.page.goto(`${SETTINGS}/ticket-properties`);
  await expect(
    stranger.page.getByText('You need the frontline.channel.view permission'),
  ).toBeVisible();
});
