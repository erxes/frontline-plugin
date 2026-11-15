import {
  createPipeline,
  expect,
  expectAccessible,
  openChannelPipelines,
  test,
} from './fixtures.ts';

test('a channel admin creates a pipeline and sets its ticket numbers; a member reads them', async ({
  page,
  newMember,
}) => {
  const teammate = await newMember(['frontline.channel.view']);

  await openChannelPipelines(page, teammate.fullName);
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Create pipeline' }).first().click();
  const sheet = page.getByRole('dialog');

  await sheet.getByLabel('Pipeline name').fill('Returns');

  // Closing the panel keeps the draft.
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await page.getByRole('button', { name: 'Create pipeline' }).first().click();
  await expect(sheet.getByLabel('Pipeline name')).toHaveValue('Returns');
  await sheet.getByLabel('Description').fill('Refunds and exchanges');
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Returns' })).toBeVisible();

  // The preview shows the number a ticket made today gets.
  await page.getByLabel('Ticket number').fill('RT-{year}-');
  await page.getByLabel('Digits').fill('4');
  await expect(page.locator('p[aria-live]')).toContainText(`RT-${new Date().getFullYear()}-0000`);
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Pipeline updated successfully')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Ticket number')).toHaveValue('RT-{year}-');
  await expect(page.getByLabel('Digits')).toHaveValue('4');

  // A member of the channel reads its pipelines and can't change them.
  await teammate.page.goto(page.url().replace(/\/[^/]+$/, ''));
  await expect(teammate.page.getByRole('link', { name: 'Returns' })).toBeVisible();
  await expect(teammate.page.getByRole('button', { name: 'Create pipeline' })).toBeHidden();
  await expect(teammate.page.getByRole('button', { name: 'Actions for Returns' })).toBeHidden();
  await expectAccessible(teammate.page);
  await teammate.page.getByRole('link', { name: 'Returns' }).click();
  await expect(teammate.page.getByLabel('Ticket number')).toBeDisabled();
  await expect(teammate.page.getByRole('button', { name: 'Save' })).toBeHidden();
  await expectAccessible(teammate.page);
});

test("a channel admin adds, reorders, edits and deletes a pipeline's statuses", async ({
  page,
  newMember,
}) => {
  const teammate = await newMember(['frontline.channel.view']);

  await openChannelPipelines(page, teammate.fullName);
  await createPipeline(page);
  await page.getByRole('link', { name: 'Ticket statuses' }).click();
  const open = page.getByRole('region', { name: 'Open' });
  const sheet = page.getByRole('dialog', { name: /Add a status to Open|Edit status/ });

  // A new pipeline starts with a status in each stage.
  for (const stage of ['New', 'Open', 'In progress', 'Resolved', 'Closed', 'Cancelled']) {
    await expect(
      page.getByRole('region', { name: stage }).getByRole('button', { name: stage, exact: true }),
    ).toBeVisible();
  }

  await page.getByRole('button', { name: 'Add a status to Open' }).click();
  await sheet.getByLabel('Name').fill('Waiting on customer');
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Create' }).click();
  await expect(sheet).toBeHidden();
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
  await expect(open.getByRole('listitem').first()).toContainText('Waiting on customer');

  await open.getByRole('button', { name: 'Waiting on customer', exact: true }).click();
  await sheet.getByLabel('Name').fill('Waiting');
  await sheet.getByRole('button', { name: 'Update' }).click();
  await expect(open.getByRole('button', { name: 'Waiting', exact: true })).toBeVisible();

  await teammate.page.goto(page.url());
  await expect(teammate.page.getByRole('button', { name: 'Waiting', exact: true })).toBeDisabled();
  await expect(teammate.page.getByRole('button', { name: 'Add a status to Open' })).toBeHidden();
  await expect(teammate.page.getByRole('button', { name: 'Reorder Waiting' })).toBeHidden();
  await expectAccessible(teammate.page);

  await open.getByRole('button', { name: 'Actions for Waiting' }).click();
  await page.getByRole('option', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('textbox').fill('delete');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(open.getByRole('listitem')).toHaveCount(1);
});

test("a channel admin sets a pipeline's SLA", async ({ page }) => {
  await openChannelPipelines(page);
  await createPipeline(page);
  await page.getByRole('link', { name: 'SLA' }).click();
  await page.getByRole('switch', { name: 'Keep an SLA' }).click();
  await page.getByLabel('First response for Critical').fill('1');
  await page.getByLabel('Resolution for Critical').fill('4');
  await page.getByLabel('Warn before (hours)').fill('0.5');
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Pipeline updated successfully')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Keep an SLA' })).toBeChecked();
  await expect(page.getByLabel('First response for Critical')).toHaveValue('1');
  await expect(page.getByLabel('Resolution for Critical')).toHaveValue('4');
  await expect(page.getByLabel('Warn before (hours)')).toHaveValue('0.5');
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
  await page.getByRole('button', { name: `Actions for ${pipeline}` }).click();
  await page.getByRole('option', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('textbox').fill('delete');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Pipeline removed successfully')).toBeVisible();
  await expect(page.getByText('No pipelines yet')).toBeVisible();
});

test('a member without frontline permissions is refused the pipelines', async ({ newMember }) => {
  const { page } = await newMember(['team.view']);

  await page.goto('/frontline/settings/channels/missing/pipelines');
  await expect(page.getByText('You need the frontline.channel.view permission')).toBeVisible();
  await expectAccessible(page);
});
