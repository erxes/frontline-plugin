import { expect, type Locator, type Page } from '@playwright/test';

/** The card of integration kind `title` among a channel's Kinds of integration cards. */
export const cardOf = (page: Page, title: string) =>
  page
    .getByRole('list', { name: 'Kinds of integration' })
    .getByRole('listitem')
    .filter({ has: page.getByText(title, { exact: true }) });

/** The section links of the open channel's settings. */
export const channelSections = (page: Page) =>
  page.getByRole('navigation', { name: 'Channel settings' });

/**
 * Adds `name` to the new channel's members in `panel`: the row's "Add" button opens the team to
 * search, and the pick shows as a chip once the list closes.
 */
export const addChannelMember = async (panel: Locator, name: string) => {
  const page = panel.page();
  const search = page.getByPlaceholder('Members');

  await panel.getByRole('button', { name: 'Add', exact: true }).click();
  await search.fill(name);
  await page.getByRole('option', { name }).click();
  await search.press('Escape');
  await expect(search).toBeHidden();
  await expect(panel.getByText(name)).toBeVisible();
};
