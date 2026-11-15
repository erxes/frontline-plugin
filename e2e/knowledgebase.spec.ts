import type { Page } from '@playwright/test';
import { expect, expectAccessible, test, unique } from './fixtures.ts';

/** Creates a topic from the side panel; returns its articles page. */
const newTopic = async (page: Page, title: string) => {
  const sheet = page.getByRole('dialog');

  await page.goto('/frontline/knowledgebase?topic=new');
  await sheet.getByLabel('Title', { exact: true }).fill(title);
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Create Topic' }).click();

  // Creating opens the new topic's articles, closing the panel.
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/knowledgebase\/[^/]+\/articles$/);
  await expect(page.getByRole('link', { name: title }).first()).toBeVisible();
  await expect(page.getByText('No articles yet')).toBeVisible();

  return page.url();
};

/** Writes an article in the open topic's first category. */
const newArticle = async (page: Page, title: string) => {
  const sheet = page.getByRole('dialog');

  await page.getByRole('button', { name: 'New Article' }).first().click();
  await sheet.getByLabel('Title', { exact: true }).fill(title);
  await sheet.getByRole('textbox', { name: 'Content' }).fill('Refunds reach your card in 5 days.');
  await sheet.getByRole('button', { name: 'Create Article' }).click();
  await expect(page.getByRole('row', { name: new RegExp(title) })).toBeVisible();
};

/** Opens a category's side panel from the categories page and creates it under `parent`. */
const newCategory = async (page: Page, title: string, parent?: string) => {
  const sheet = page.getByRole('dialog');

  await page.getByRole('button', { name: 'New Category' }).first().click();
  await sheet.getByLabel('Title', { exact: true }).fill(title);

  if (parent) {
    await sheet.getByRole('combobox', { name: 'Parent category' }).click();
    await page.getByRole('option', { name: parent }).click();
  }

  await sheet.getByRole('button', { name: 'Create Category' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('row', { name: new RegExp(title) })).toBeVisible();
};

test('a manager files articles under categories that a reader can only read', async ({
  page,
  newMember,
}) => {
  const reader = await newMember(['frontline.knowledgebase.view']);
  const sheet = page.getByRole('dialog');
  const articles = await newTopic(page, `Help ${unique()}`);

  await page.goto(articles.replace(/articles$/, 'categories'));
  await newCategory(page, 'Billing');
  await newCategory(page, 'Cards', 'Billing');
  await expectAccessible(page);

  await page.goto(articles);
  await page.getByRole('button', { name: 'New Article' }).first().click();
  await sheet.getByLabel('Title', { exact: true }).fill('Refunds');

  // Closing the panel keeps the draft.
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await page.getByRole('button', { name: 'New Article' }).first().click();
  await expect(sheet.getByLabel('Title', { exact: true })).toHaveValue('Refunds');

  await sheet.getByRole('textbox', { name: 'Content' }).fill('Refunds reach your card in 5 days.');
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Create Article' }).click();
  await expect(page.getByRole('row', { name: /Refunds/ })).toBeVisible();
  await expect(page.getByText('1 record found')).toBeVisible();

  await page.getByRole('button', { name: 'Refunds', exact: true }).click();
  await sheet.getByLabel('Title', { exact: true }).fill('Card refunds');
  await sheet.getByRole('button', { name: 'Save Changes' }).click();
  await expect(sheet).toBeHidden();

  const status = page.getByRole('combobox', { name: 'Status of Card refunds' });

  await status.click();
  await page.getByRole('option', { name: 'Published' }).click();
  await expect(status).toHaveText('Published');
  await expectAccessible(page);

  // The sidebar narrows the list to a category and everything under it.
  const sidebar = page.getByRole('navigation', { name: 'Knowledge Base' });

  await sidebar.getByRole('link', { name: /Cards/ }).click();
  await expect(page.getByText('No articles yet')).toBeVisible();
  await sidebar.getByRole('link', { name: /Billing/ }).click();
  await expect(page.getByRole('row', { name: /Card refunds/ })).toBeVisible();

  // A reader sees the article and can't change it.
  await reader.page.goto(articles);
  await expect(reader.page.getByRole('row', { name: /Card refunds/ })).toBeVisible();
  await expect(reader.page.getByRole('button', { name: 'New Article' })).toBeHidden();
  await expect(reader.page.getByRole('button', { name: 'Actions for Card refunds' })).toBeHidden();
  await expectAccessible(reader.page);
});

test('a manager duplicates and deletes an article, then renames and deletes its topic', async ({
  page,
}) => {
  const topic = `Guides ${unique()}`;
  const articles = await newTopic(page, topic);
  const confirm = page.getByRole('alertdialog');
  const sidebar = page.getByRole('navigation', { name: 'Knowledge Base' });

  await page.goto(articles.replace(/articles$/, 'categories'));
  await newCategory(page, 'General');
  await page.goto(articles);
  await newArticle(page, 'Refunds');

  await page.getByRole('button', { name: 'Actions for Refunds' }).click();
  await page.getByRole('option', { name: 'Duplicate' }).click();
  await expect(page.getByRole('row', { name: /Refunds \(copy\)/ })).toBeVisible();
  // Picking an action closes its menu.
  await expect(page.getByRole('option', { name: 'Duplicate' })).toBeHidden();

  await page.getByRole('button', { name: 'Actions for Refunds (copy)' }).click();
  await page.getByRole('option', { name: 'Delete' }).click();
  await confirm.getByRole('textbox').fill('delete');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('1 record found')).toBeVisible();

  await page.goto(articles.replace(/articles$/, 'kbsettings'));
  await page.getByLabel('Title', { exact: true }).fill(`${topic} center`);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Topic saved')).toBeVisible();
  await expect(sidebar.getByRole('link', { name: `${topic} center` })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Delete Topic' }).click();
  await confirm.getByRole('textbox').fill('delete');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Topic deleted')).toBeVisible();
  await expect(sidebar.getByRole('link', { name: `${topic} center` })).toBeHidden();
});

test('a member without the knowledge base permission is refused', async ({ newMember }) => {
  const { page } = await newMember(['team.view']);

  await page.goto('/frontline/knowledgebase');
  await expect(
    page.getByText('You need the frontline.knowledgebase.view permission'),
  ).toBeVisible();
  await expectAccessible(page);
});
