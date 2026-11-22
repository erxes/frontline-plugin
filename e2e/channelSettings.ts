import type { Page } from '@playwright/test';

/** The card of integration kind `title` among the channel settings' Add an integration cards. */
export const cardOf = (page: Page, title: string) =>
  page
    .getByRole('list', { name: 'Add an integration' })
    .getByRole('listitem')
    .filter({ has: page.getByText(title, { exact: true }) });

/** The section links of the open channel's settings. */
export const channelSections = (page: Page) =>
  page.getByRole('navigation', { name: 'Channel settings' });
