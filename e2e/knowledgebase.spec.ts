import type { Page } from '@playwright/test';
import {
  confirmDelete,
  expect,
  expectPage,
  recordPath,
  recordPanel,
  test,
  unique,
} from './fixtures.ts';

const KB = '/frontline/knowledgebase';

/** Drafts a topic in core's side panel and creates it; returns its page, open at its articles. */
const newTopic = async (page: Page, title: string) => {
  const panel = recordPanel(page);

  await page.goto(recordPath(KB, 'frontline:kb-topic'));
  await panel.getByRole('textbox', { name: 'Title', exact: true }).fill(title);

  await panel.getByRole('button', { name: 'Create topic' }).click();

  // The topic opens on its own page, at its articles; its card on the topics leads there too.
  await expectPage(page, 'Articles');
  await page.goto(KB);
  await page.getByRole('link', { name: title, exact: true }).click();
  await expectPage(page, 'Articles');

  return page.url();
};

/** Creates a category from the categories page's New button, or under `parent` from its row. */
const newCategory = async (page: Page, title: string, parent?: string) => {
  const panel = recordPanel(page);

  if (parent) {
    await page.getByRole('button', { name: `Actions for ${parent}` }).click();
    await page.getByRole('option', { name: 'New subcategory' }).click();
  } else {
    await page.getByRole('button', { name: 'New category' }).first().click();
  }

  await panel.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
  await panel.getByRole('button', { name: 'Create category' }).click();
  await expect(panel.getByRole('button', { name: `Title ${title}`, exact: true })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(title) })).toBeVisible();
};

/** Creates a draft article in the open topic's first category; it opens on its own page. */
const newArticle = async (page: Page, title: string) => {
  const panel = recordPanel(page);

  await page.getByRole('button', { name: 'New article' }).first().click();
  await panel.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
  await panel.getByLabel('Summary').fill('How long a refund takes.');
  await panel.getByRole('button', { name: 'Create article' }).click();
  await expect(page).toHaveURL(/\/knowledgebase\/article\/[^/?]+$/);
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(title);
};

test('a manager files articles under categories that a reader can only read', async ({
  page,
  newMember,
}) => {
  const reader = await newMember(['frontline.knowledgebase.view']);
  const articles = await newTopic(page, `Help ${unique()}`);
  const categories = `${articles}/categories`;

  await page.goto(categories);
  await newCategory(page, 'Billing');
  await newCategory(page, 'Cards', 'Billing');

  await page.goto(articles);
  await newArticle(page, 'Refunds');

  // The article opened on its own page when it was created; it is written there, each part
  // saved as it is left.
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Card refunds');
  await page.keyboard.press('Tab');
  await page.getByRole('combobox', { name: /^Status / }).click();
  await page.getByRole('option', { name: 'Published' }).click();
  await expect(page.getByRole('combobox', { name: /^Status / })).toContainText('Published');
  await page.goto(articles);

  const published = page.getByRole('region', { name: 'Published' });

  await expect(published.getByRole('link', { name: 'Card refunds', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Draft' })).toBeHidden();

  // A category's articles are the ones in it and under it: Cards has none, Billing has Refunds.
  await page.goto(categories);
  await page.getByRole('button', { name: 'Actions for Cards' }).click();
  await page.getByRole('option', { name: 'View articles' }).click();
  await expect(page.getByRole('button', { name: 'Category: Cards' })).toBeVisible();
  await expect(page.getByText('No results found')).toBeVisible();
  await page.goto(categories);
  await page.getByRole('button', { name: 'Actions for Billing' }).click();
  await page.getByRole('option', { name: 'View articles' }).click();
  await expect(published.getByRole('link', { name: 'Card refunds', exact: true })).toBeVisible();

  // A reader sees the article and can't change it.
  await reader.page.goto(articles);
  await expect(reader.page.getByRole('link', { name: 'Card refunds', exact: true })).toBeVisible();
  await expect(reader.page.getByRole('button', { name: 'New article' })).toBeHidden();
  await expect(reader.page.getByRole('button', { name: 'Actions for Card refunds' })).toBeHidden();
  await reader.page.getByRole('link', { name: 'Card refunds', exact: true }).click();
  await expect(reader.page.getByRole('textbox', { name: 'Title', exact: true })).toBeDisabled();
});

test('a manager duplicates and deletes an article, then sets up and deletes its topic', async ({
  page,
}) => {
  const topic = `Guides ${unique()}`;
  const articles = await newTopic(page, topic);

  await page.goto(`${articles}/categories`);
  await newCategory(page, 'General');
  await page.goto(articles);
  await newArticle(page, 'Refunds');
  await page.goto(articles);

  await page.getByRole('button', { name: 'Actions for Refunds' }).click();
  await page.getByRole('option', { name: 'Duplicate' }).click();
  await expect(page.getByRole('link', { name: 'Refunds (copy)', exact: true })).toBeVisible();
  // Picking an action closes its menu.
  await expect(page.getByRole('option', { name: 'Duplicate' })).toBeHidden();

  await page.getByRole('button', { name: 'Actions for Refunds (copy)' }).click();
  await page.getByRole('option', { name: 'Delete' }).click();
  await confirmDelete(page);
  await expect(page.getByRole('link', { name: 'Refunds (copy)', exact: true })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Refunds', exact: true })).toBeVisible();

  // Its settings are the topic page's last section.
  await page
    .getByRole('navigation', { name: 'Topic' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await page.getByRole('combobox', { name: 'Language' }).click();
  await page.getByRole('option', { name: 'English' }).click();

  // With a change pending, a link away asks first; Cancel keeps the page and its change.
  const settingsUrl = page.url();
  const leave = page.getByRole('alertdialog');

  await page.getByRole('link', { name: /^Tickets( \d+ unread)?$/ }).click();
  await expect(leave).toContainText('Discard your unsaved changes?');
  await leave.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(settingsUrl);

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Topic saved')).toBeVisible();

  // Saved, the page leaves without asking.
  await page.getByRole('link', { name: /^Tickets( \d+ unread)?$/ }).click();
  await expect(page).toHaveURL(/\/frontline\/tickets/);
  await page.goto(settingsUrl);

  await page.getByRole('button', { name: 'Delete topic' }).click();
  await confirmDelete(page);
  await expect(page.getByText('Topic deleted')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${KB}$`));
  await expect(page.getByRole('link', { name: topic, exact: true })).toBeHidden();
});

test('a member without the knowledge base permission is refused', async ({ newMember }) => {
  const { page } = await newMember(['team.view']);

  await page.goto('/frontline/knowledgebase');
  await expect(
    page.getByText('You need the frontline.knowledgebase.view permission'),
  ).toBeVisible();
});
