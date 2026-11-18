import type { Page } from '@playwright/test';
import { confirmDelete, expect, newRecordPath, recordPanel, test, unique } from './fixtures.ts';

const KB = '/frontline/knowledgebase';

/** Drafts a topic in core's side panel and creates it; returns its articles page. */
const newTopic = async (page: Page, title: string) => {
  const panel = recordPanel(page);

  await page.goto(newRecordPath(KB, 'frontline:kb-topic'));
  await panel.getByRole('textbox', { name: 'Title', exact: true }).fill(title);

  await panel.getByRole('button', { name: 'Create topic' }).click();

  // The topic takes the draft's place in the panel, and joins the cards; its card opens its articles.
  await expect(panel.getByRole('button', { name: `Title ${title}`, exact: true })).toBeVisible();
  await page.getByRole('link', { name: title, exact: true }).click();
  await expect(page).toHaveURL(/\/knowledgebase\/[^/]+\/articles$/);
  // The topic cards say "No articles yet" too, and stay on screen until the articles page renders.
  await expect(page.getByText('Write the first article of this topic.')).toBeVisible();

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

/** Creates a draft article in the open topic's first category. */
const newArticle = async (page: Page, title: string) => {
  const panel = recordPanel(page);

  await page.getByRole('button', { name: 'New article' }).first().click();
  await panel.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
  await panel.getByLabel('Summary').fill('How long a refund takes.');
  await panel.getByRole('button', { name: 'Create article' }).click();
  await expect(
    page.getByRole('region', { name: 'Draft' }).getByRole('button', { name: title, exact: true }),
  ).toBeVisible();
};

test('a manager files articles under categories that a reader can only read', async ({
  page,
  newMember,
}) => {
  const reader = await newMember(['frontline.knowledgebase.view']);
  const panel = recordPanel(page);
  const articles = await newTopic(page, `Help ${unique()}`);
  const categories = articles.replace(/articles$/, 'categories');

  await page.goto(categories);
  await newCategory(page, 'Billing');
  await newCategory(page, 'Cards', 'Billing');

  await page.goto(articles);
  await newArticle(page, 'Refunds');

  // The article opened in the panel when it was created; its fields are edited in place.
  await panel.getByRole('button', { name: 'Title Refunds', exact: true }).click();
  await page.getByPlaceholder('Title', { exact: true }).fill('Card refunds');
  await page.keyboard.press('Enter');
  await expect(
    panel.getByRole('button', { name: 'Title Card refunds', exact: true }),
  ).toBeVisible();

  await panel.getByRole('combobox', { name: /^Status / }).click();
  await page.getByRole('option', { name: 'Published' }).click();

  const published = page.getByRole('region', { name: 'Published' });

  await expect(published.getByRole('button', { name: 'Card refunds', exact: true })).toBeVisible();
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
  await expect(published.getByRole('button', { name: 'Card refunds', exact: true })).toBeVisible();

  // A reader sees the article and can't change it.
  await reader.page.goto(articles);
  await expect(
    reader.page.getByRole('button', { name: 'Card refunds', exact: true }),
  ).toBeVisible();
  await expect(reader.page.getByRole('button', { name: 'New article' })).toBeHidden();
  await expect(reader.page.getByRole('button', { name: 'Actions for Card refunds' })).toBeHidden();
  await reader.page.getByRole('button', { name: 'Card refunds', exact: true }).click();
  await expect(
    recordPanel(reader.page).getByRole('button', { name: 'Title Card refunds', exact: true }),
  ).toBeDisabled();
});

test('a manager duplicates and deletes an article, then sets up and deletes its topic', async ({
  page,
}) => {
  const topic = `Guides ${unique()}`;
  const articles = await newTopic(page, topic);

  await page.goto(articles.replace(/articles$/, 'categories'));
  await newCategory(page, 'General');
  await page.goto(articles);
  await newArticle(page, 'Refunds');

  await page.getByRole('button', { name: 'Actions for Refunds' }).click();
  await page.getByRole('option', { name: 'Duplicate' }).click();
  await expect(page.getByRole('button', { name: 'Refunds (copy)', exact: true })).toBeVisible();
  // Picking an action closes its menu.
  await expect(page.getByRole('option', { name: 'Duplicate' })).toBeHidden();

  await page.getByRole('button', { name: 'Actions for Refunds (copy)' }).click();
  await page.getByRole('option', { name: 'Delete' }).click();
  await confirmDelete(page);
  await expect(page.getByRole('button', { name: 'Refunds (copy)', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Refunds', exact: true })).toBeVisible();

  await page.goto(articles.replace(/articles$/, 'kbsettings'));
  await page.getByRole('combobox', { name: 'Language' }).click();
  await page.getByRole('option', { name: 'English' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Topic saved')).toBeVisible();

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
