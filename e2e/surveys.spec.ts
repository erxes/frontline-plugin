import type { Page } from '@playwright/test';
import {
  addMessenger,
  confirmDelete,
  expect,
  INBOX,
  openChannelPipelines,
  pick,
  recordPanel,
  test,
  unique,
  visitorOf,
} from './fixtures.ts';
import { expectAccessible } from './axe.ts';

const SURVEYS = '/frontline/surveys';

/** Drafts a survey in `channel` with one question and its options, and creates it. */
const newSurvey = async (page: Page, channel: string, title: string) => {
  const panel = recordPanel(page);

  await page.goto(SURVEYS);
  await page.getByRole('button', { name: 'New survey' }).first().click();
  await pick(page, panel.getByRole('combobox', { name: 'Channel' }), channel);
  await panel.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
  await panel.getByRole('textbox', { name: 'Question', exact: true }).fill('How did we do?');

  for (const option of ['Great', 'Fine', 'Poor']) {
    await panel.getByPlaceholder('Type an option and press Enter').fill(option);
    await page.keyboard.press('Enter');
  }

  await panel.getByRole('button', { name: 'Create survey' }).click();
  await expect(panel.getByRole('button', { name: `Title ${title}`, exact: true })).toBeVisible();
};

test('an admin writes a survey, edits its questions and reads its results, which a member only reads', async ({
  page,
  newMember,
}) => {
  const teammate = await newMember(['frontline.channel.view']);
  const channel = await openChannelPipelines(page, teammate.fullName);
  const panel = recordPanel(page);
  const title = `After the call ${unique()}`;

  await newSurvey(page, channel, title);
  await expect(
    page.getByRole('region', { name: 'Active' }).getByRole('button', { name: title, exact: true }),
  ).toBeVisible();

  // Its Questions tab adds and edits questions in place.
  await panel.getByRole('tab', { name: 'Questions' }).click();
  await expect(panel.getByRole('button', { name: 'How did we do?', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Add question' }).click();
  await panel.getByRole('button', { name: 'New question', exact: true }).click();
  await page.getByPlaceholder('Question', { exact: true }).fill('Would you call again?');
  await page.keyboard.press('Enter');
  await expect(
    panel.getByRole('button', { name: 'Would you call again?', exact: true }),
  ).toBeVisible();

  await panel.getByRole('tab', { name: 'Results' }).click();
  const results = panel.getByRole('tabpanel', { name: 'Results' });

  await expect(results.getByText('0 voters')).toBeVisible();
  await expect(results.getByText('Great', { exact: true })).toBeVisible();

  await panel.getByRole('tab', { name: 'Activity' }).click();
  await expect(panel.getByText(`Created ${title}`)).toBeVisible();
  // One entry for the added question, one for its new wording.
  await expect(panel.getByText('Changed questions')).toHaveCount(2);

  // The filter bar narrows by question, and the filter lives in the address.
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('option', { name: 'Question', exact: true }).click();
  await page.getByRole('textbox', { name: 'Value' }).fill('call again');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/subject\.question/);
  await page.reload();
  await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();

  // A channel member sees the survey and its results, but can't change it.
  await teammate.page.goto(SURVEYS);
  await expect(teammate.page.getByRole('button', { name: title, exact: true })).toBeVisible();
  await expect(teammate.page.getByRole('button', { name: `Actions for ${title}` })).toBeHidden();
  await expect(teammate.page.getByRole('button', { name: 'New survey' })).toBeHidden();
  await teammate.page.getByRole('button', { name: title, exact: true }).click();
  await expect(
    recordPanel(teammate.page).getByRole('button', { name: `Title ${title}`, exact: true }),
  ).toBeDisabled();
});

test('an admin archives, reactivates and deletes surveys', async ({ page }) => {
  const channel = await openChannelPipelines(page);
  const title = `Poll ${unique()}`;

  await newSurvey(page, channel, title);
  await page.getByRole('button', { name: `Actions for ${title}` }).click();
  await page.getByRole('option', { name: 'Archive' }).click();
  await expect(
    page
      .getByRole('region', { name: 'Archived' })
      .getByRole('button', { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: `Actions for ${title}` }).click();
  await page.getByRole('option', { name: 'Activate' }).click();
  await expect(
    page.getByRole('region', { name: 'Active' }).getByRole('button', { name: title, exact: true }),
  ).toBeVisible();

  // Narrowed to its channel, the table's bar deletes it.
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('option', { name: 'Channel', exact: true }).click();
  await page.getByRole('option', { name: channel, exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Display' }).click();
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('checkbox', { name: 'Select all rows' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Delete this survey and its votes?');
  await confirmDelete(page);
  await expect(page.getByText('No results found')).toBeVisible();
  await page.getByRole('button', { name: 'Display' }).click();
  await page.getByRole('button', { name: 'List', exact: true }).click();
});

test('a member sends a survey into a messenger conversation and the visitor gets it', async ({
  page,
  request,
}) => {
  const channel = await openChannelPipelines(page);
  const title = `Rate us ${unique()}`;
  const hello = `Hello ${unique()}`;

  await newSurvey(page, channel, title);
  await page.goto(INBOX);

  const visitor = await visitorOf(request, await addMessenger(page, channel));
  const conversationId = await visitor.write(hello);

  await page.goto(INBOX);
  await page
    .getByRole('list', { name: 'Conversations' })
    .getByRole('button', { name: new RegExp(hello) })
    .click();
  await page.getByRole('button', { name: 'Send survey' }).click();
  await page.getByRole('menuitem', { name: title }).click();

  const thread = page.getByRole('list', { name: 'Messages' });

  // A survey's card in the thread.
  await expectAccessible(page, thread.getByRole('button', { name: `${title} 0 votes` }));
  await expect.poll(() => visitor.read(conversationId)).toContain('How did we do?');
});

test('a member without frontline permissions is refused the surveys', async ({ newMember }) => {
  const { page } = await newMember(['team.view']);

  await page.goto(SURVEYS);
  await expect(page.getByText('You need the frontline.channel.view permission')).toBeVisible();
});
