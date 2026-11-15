import type { Page } from '@playwright/test';
import { expect, expectAccessible, newRecordPath, recordPanel, test, unique } from './fixtures.ts';

/** Creates a channel, with `memberName` in it when given, and opens its pipelines list. */
const openChannelPipelines = async (page: Page, memberName?: string) => {
  const channel = `Support ${unique()}`;
  const panel = recordPanel(page);

  await page.goto(newRecordPath('/frontline/settings/channels', 'frontline:channel'));
  await panel.getByLabel('Name').fill(channel);

  if (memberName) {
    await panel.getByPlaceholder('Search members').fill(memberName);
    await panel.getByRole('option', { name: memberName }).click();
  }

  await panel.getByRole('button', { name: 'Create channel' }).click();
  await panel.getByRole('link', { name: /Manage channel pipelines/ }).click();
  await expect(page.getByText('No pipelines yet')).toBeVisible();

  return channel;
};

/** Drafts a pipeline in core's side panel from the list's header and saves it into the record. */
const createPipeline = async (page: Page, name = `Returns ${unique()}`) => {
  const panel = recordPanel(page);

  await page.getByRole('button', { name: 'Create pipeline' }).click();
  await panel.getByLabel('Name').fill(name);
  await panel.getByRole('button', { name: 'Create pipeline' }).click();
  await expect(panel.getByRole('button', { name: `Name ${name}` })).toBeVisible();

  return name;
};

/** Opens a panel field's in-place editor, types `value` and saves it with Enter. */
const editField = async (page: Page, field: RegExp, value: string) => {
  await recordPanel(page).getByRole('button', { name: field }).click();
  await page.keyboard.type(value);
  await page.keyboard.press('Enter');
};

test('a channel admin creates a pipeline and sets its ticket numbers; a member reads them', async ({
  page,
  newMember,
}) => {
  const teammate = await newMember(['frontline.channel.view']);
  const panel = recordPanel(page);

  await openChannelPipelines(page, teammate.fullName);
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Create pipeline' }).click();
  await panel.getByLabel('Name').fill('Returns');
  await panel.getByLabel('Description').fill('Refunds and exchanges');
  await expectAccessible(page);
  await panel.getByRole('button', { name: 'Create pipeline' }).click();
  await expect(panel.getByRole('button', { name: 'Name Returns' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Returns/ })).toBeVisible();

  // The ticket number is edited in place, and the preview shows what a ticket made today gets.
  await editField(page, /^Ticket number/, 'RT-{year}-');
  await editField(page, /^Digits/, '4');
  await expect(panel.locator('output')).toContainText(`RT-${new Date().getFullYear()}-0000`);
  await expectAccessible(page);
  await page.reload();
  await expect(panel.getByRole('button', { name: /^Ticket number RT-\{year\}-/ })).toBeVisible();
  await expect(panel.getByRole('button', { name: /^Digits 4/ })).toBeVisible();

  // A member of the channel reads its pipelines and can't change them.
  await teammate.page.goto(page.url().split('?')[0] ?? '');
  await expect(teammate.page.getByRole('button', { name: 'Returns' })).toBeVisible();
  await expect(teammate.page.getByRole('button', { name: 'Create pipeline' })).toBeHidden();
  await expect(teammate.page.getByRole('button', { name: 'Actions for Returns' })).toBeHidden();
  await expectAccessible(teammate.page);
  await teammate.page.getByRole('button', { name: 'Returns' }).click();
  await expect(
    recordPanel(teammate.page).getByRole('button', { name: /^Ticket number/ }),
  ).toBeDisabled();
  await expectAccessible(teammate.page);
});

test("a channel admin adds, reorders, edits and deletes a pipeline's statuses", async ({
  page,
  newMember,
}) => {
  const teammate = await newMember(['frontline.channel.view']);
  const panel = recordPanel(page);

  await openChannelPipelines(page, teammate.fullName);
  await createPipeline(page);
  await panel.getByRole('tab', { name: 'Ticket statuses' }).click();
  const open = panel.getByRole('region', { name: 'Open' });

  // A new pipeline starts with a status in each stage.
  for (const stage of ['New', 'Open', 'In progress', 'Resolved', 'Closed', 'Cancelled']) {
    await expect(
      panel.getByRole('region', { name: stage }).getByRole('button', { name: stage, exact: true }),
    ).toBeVisible();
  }

  await panel.getByRole('button', { name: 'Add a status to Open' }).click();
  await page.getByLabel('Status name').fill('Waiting on customer');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(open.getByRole('listitem').last()).toContainText('Waiting on customer');
  await expectAccessible(page);

  // The keyboard moves a status up its stage, and the order is saved. Each key waits for the
  // screen reader announcement, since dnd-kit listens for the next key only after it.
  const handle = open.getByRole('button', { name: 'Reorder Waiting on customer' });
  const announcement = page.getByText(/was moved over droppable area/);

  await handle.press('Space');
  await expect(handle).toHaveAttribute('aria-pressed', 'true');
  const overItself = await announcement.textContent();

  await page.keyboard.press('ArrowUp');
  await expect(announcement).not.toHaveText(overItself ?? '');
  await page.keyboard.press('Space');
  await expect(open.getByRole('listitem').first()).toContainText('Waiting on customer');
  await page.reload();
  await panel.getByRole('tab', { name: 'Ticket statuses' }).click();
  await expect(open.getByRole('listitem').first()).toContainText('Waiting on customer');

  // The name is edited in place.
  await open.getByRole('button', { name: 'Waiting on customer', exact: true }).click();
  await page.getByPlaceholder('Name').fill('Waiting');
  await page.keyboard.press('Enter');
  await expect(open.getByRole('button', { name: 'Waiting', exact: true })).toBeVisible();

  await teammate.page.goto(page.url());
  const theirPanel = recordPanel(teammate.page);

  await theirPanel.getByRole('tab', { name: 'Ticket statuses' }).click();
  await expect(theirPanel.getByRole('button', { name: 'Waiting', exact: true })).toBeDisabled();
  await expect(theirPanel.getByRole('button', { name: 'Add a status to Open' })).toBeHidden();
  await expect(theirPanel.getByRole('button', { name: 'Reorder Waiting' })).toBeHidden();
  await expectAccessible(teammate.page);

  await open.getByRole('button', { name: 'Actions for Waiting' }).click();
  await page.getByRole('option', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('textbox').fill('delete');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(open.getByRole('listitem')).toHaveCount(1);

  // A stage's checkbox picks its statuses, and the bar under the list deletes them at once.
  const cancelled = panel.getByRole('region', { name: 'Cancelled' });

  await panel.getByRole('checkbox', { name: 'Select all in Cancelled' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('textbox').fill('delete');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(cancelled.getByRole('listitem')).toHaveCount(0);
});

test("a channel admin sets a pipeline's SLA", async ({ page }) => {
  const panel = recordPanel(page);

  await openChannelPipelines(page);
  await createPipeline(page);
  await panel.getByRole('tab', { name: 'SLA' }).click();
  await panel.getByRole('switch', { name: 'Keep an SLA' }).click();
  await editField(page, /^First response for Critical/, '1');
  await editField(page, /^Resolution for Critical/, '4');
  await editField(page, /^Warn before/, '0.5');
  await expectAccessible(page);
  await page.reload();
  await panel.getByRole('tab', { name: 'SLA' }).click();
  await expect(panel.getByRole('switch', { name: 'Keep an SLA' })).toBeChecked();
  await expect(
    panel.getByRole('button', { name: /^First response for Critical 1 h/ }),
  ).toBeVisible();
  await expect(panel.getByRole('button', { name: /^Resolution for Critical 4 h/ })).toBeVisible();
  await expect(panel.getByRole('button', { name: /^Warn before 0\.5 h/ })).toBeVisible();
});

test('a channel admin moves a pipeline to another channel and deletes it there', async ({
  page,
}) => {
  const other = await openChannelPipelines(page);
  const pipelinesOfOther = page.url();

  await openChannelPipelines(page);
  const pipelines = page.url();
  const pipeline = await createPipeline(page);

  await page.goto(pipelines);
  await page.getByRole('button', { name: `Actions for ${pipeline}` }).click();
  await page.getByRole('option', { name: 'Move to channel' }).click();
  await page.getByRole('dialog').getByRole('option', { name: other }).click();
  await expect(page.getByText(`Moved to ${other}`)).toBeVisible();
  await expect(page.getByText('No pipelines yet')).toBeVisible();

  await page.goto(pipelinesOfOther);
  await page
    .getByRole('row', { name: new RegExp(pipeline) })
    .getByRole('checkbox')
    .click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('textbox').fill('delete');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Pipeline deleted')).toBeVisible();
  await expect(page.getByText('No pipelines yet')).toBeVisible();
});

test('a member without frontline permissions is refused the pipelines', async ({ newMember }) => {
  const { page } = await newMember(['team.view']);

  await page.goto('/frontline/settings/channels/missing/pipelines');
  await expect(page.getByText('You need the frontline.channel.view permission')).toBeVisible();
  await expectAccessible(page);
});
