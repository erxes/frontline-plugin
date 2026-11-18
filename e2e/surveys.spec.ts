import type { Page } from '@playwright/test';
import {
  addMessenger,
  confirmDelete,
  createPipeline,
  expect,
  expectAccessible,
  INBOX,
  openChannelPipelines,
  openMessenger,
  pick,
  recordPanel,
  test,
  unique,
} from './fixtures.ts';

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
  const pipeline = await createPipeline(page);

  await newSurvey(page, channel, title);
  await expect(
    page.getByRole('region', { name: 'Active' }).getByRole('button', { name: title, exact: true }),
  ).toBeVisible();

  // Its builder adds and edits questions in place, beside the survey as a voter reads it.
  await panel.getByRole('link', { name: /^Questions/ }).click();
  await expect(page).toHaveURL(/\/builder$/);

  const first = page.getByRole('region', { name: 'How did we do?', exact: true });
  const added = page.getByRole('region', { name: 'Would you call again?', exact: true });
  const preview = page.getByRole('region', { name: 'Preview' });

  await page.getByRole('button', { name: 'Add question' }).click();
  await page
    .getByRole('region', { name: 'New question', exact: true })
    .getByRole('textbox', { name: 'Question', exact: true })
    .fill('Would you call again?');
  await page.keyboard.press('Enter');
  await expect(preview.getByText('Would you call again?')).toBeVisible();

  // Three voters picking Great open a ticket in the channel's pipeline, at its first status.
  await first.getByRole('button', { name: 'Open a ticket from Great' }).click();
  await expect(page.getByRole('combobox', { name: 'Pipeline' })).toHaveText(pipeline);
  await page.getByRole('spinbutton', { name: 'Voters' }).fill('3');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(first.getByRole('button', { name: 'Ticket for Great at 3 voters' })).toBeVisible();

  // The keyboard moves the new question above the first. Each key waits for the screen reader
  // announcement, since dnd-kit listens for the next key only after it.
  const handle = added.getByRole('button', { name: 'Move Would you call again?', exact: true });
  const announcement = page.getByText(/was moved over droppable area/);

  await handle.press('Space');
  await expect(handle).toHaveAttribute('aria-pressed', 'true');
  const overItself = await announcement.textContent();

  await page.keyboard.press('ArrowUp');
  await expect(announcement).not.toHaveText(overItself ?? '');
  await page.keyboard.press('Space');
  await expect(page.getByRole('textbox', { name: 'Question', exact: true }).first()).toHaveValue(
    'Would you call again?',
  );

  await page.getByRole('button', { name: 'Tablet', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tablet', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(preview.getByRole('radio', { name: 'Great' })).toBeVisible();

  await page.goto(SURVEYS);
  await page.getByRole('button', { name: title, exact: true }).click();
  await panel.getByRole('tab', { name: 'Results' }).click();
  const results = panel.getByRole('tabpanel', { name: 'Results' });

  await expect(results.getByText('0 voters')).toBeVisible();
  await expect(results.getByText('Great', { exact: true })).toBeVisible();

  await panel.getByRole('tab', { name: 'Activity' }).click();
  await expect(panel.getByText(`Created ${title}`)).toBeVisible();
  // One entry each for the added question, its wording, the ticket rule and the move.
  await expect(panel.getByText('Changed questions')).toHaveCount(4);

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
  const panel = recordPanel(page);

  // An option typed into a new survey stays when the member leaves, until Cancel throws it away.
  await page.goto(SURVEYS);
  await page.getByRole('button', { name: 'New survey' }).first().click();
  await panel.getByPlaceholder('Type an option and press Enter').fill('Maybe');
  await page.keyboard.press('Enter');
  await page.goto(SURVEYS);
  await page.getByRole('button', { name: 'New survey' }).first().click();
  await expect(panel.getByText('Maybe', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Discard' }).click();

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

test('a member sends a survey into a messenger conversation and the visitor votes in the widget', async ({
  page,
}) => {
  const channel = await openChannelPipelines(page);
  const title = `Rate us ${unique()}`;
  const hello = `Hello ${unique()}`;

  await newSurvey(page, channel, title);
  await page.goto(INBOX);

  await using site = await openMessenger(page.context(), await addMessenger(page, channel));
  const widget = site.panel;

  await widget.getByRole('button', { name: 'Send us a message' }).click();
  await widget.getByRole('textbox', { name: 'Message' }).fill(hello);
  await widget.getByRole('button', { name: 'Send' }).click();
  await expect(widget).toContainText(hello);

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

  // The widget shows the ballot; the visitor votes, then changes the vote.
  const ballot = widget.getByRole('form', { name: title });

  await ballot.getByRole('radio', { name: 'Great' }).check();
  await ballot.getByRole('button', { name: 'Vote' }).click();
  await expect(ballot.getByRole('status')).toContainText('your vote is in');
  await expectAccessible(site.shop, ballot);
  await ballot.getByRole('radio', { name: 'Fine' }).check();
  await ballot.getByRole('button', { name: 'Change vote' }).click();
  await expect(ballot.getByRole('status')).toBeVisible();

  // One visitor, one vote, however often they change it.
  await page.reload();
  await expect(thread.getByRole('button', { name: `${title} 1 vote` })).toBeVisible();
});

test('a member without frontline permissions is refused the surveys', async ({ newMember }) => {
  const { page } = await newMember(['team.view']);

  await page.goto(SURVEYS);
  await expect(page.getByText('You need the frontline.channel.view permission')).toBeVisible();
});
