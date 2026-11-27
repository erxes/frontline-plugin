import { z } from 'zod';
import { expect, Id, pick, pluginApi, test, unique } from './fixtures.ts';

/** A pipeline's statuses, by name. */
const Choices = z.object({
  statuses: z.array(z.object({ id: z.string(), pipelineId: z.string(), name: z.string() })),
});

test('a list row changes its ticket in place, as a task row of Operation', async ({
  page,
  api,
  request,
}) => {
  const rpc = await pluginApi(api, request);
  const { id: channelId } = await rpc('channels/create', { name: `Support ${unique()}` }, Id);
  const pipeline = { channelId, name: `Returns ${unique()}` };
  const { id: pipelineId } = await rpc('pipelines/create', pipeline, Id);
  const { statuses } = await rpc('pipelines/choices', {}, Choices);
  const name = `Refund ${unique()}`;

  const statusId = statuses.find(
    (status) => status.pipelineId === pipelineId && status.name === 'New',
  )?.id;

  await rpc('tickets/create', { pipelineId, statusId, name }, Id);
  await page.goto(`/frontline/tickets?pipeline=${pipelineId}`);
  await expect(page.getByRole('region', { name: 'New' })).toContainText(name);

  // Its status icon moves it to another group; New, now empty, hides.
  await pick(page, page.getByRole('button', { name: `Status of ${name}` }), 'Open');
  await expect(page.getByRole('region', { name: 'Open' })).toContainText(name);
  await expect(page.getByRole('region', { name: 'New' })).toBeHidden();

  // Its priority icon and its avatar set those.
  await pick(page, page.getByRole('button', { name: `Priority of ${name}` }), 'Critical');
  await expect(page.getByRole('button', { name: `Priority of ${name}: Critical` })).toBeVisible();
  await page.getByRole('button', { name: `Assignee of ${name}` }).click();
  // The first row is No assignee, then the signed-in member.
  await page.getByRole('option').nth(1).click();
  await expect(
    page.getByRole('button', { name: new RegExp(`^Assignee of ${name}: `) }),
  ).toBeVisible();

  // The changes are saved: a reload shows them.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Open' })).toContainText(name);
  await expect(page.getByRole('button', { name: `Priority of ${name}: Critical` })).toBeVisible();

  // j focuses the first row's name and x picks it, as in Operation's list; Escape clears it.
  await page.keyboard.press('j');
  await expect(page.getByRole('button', { name: new RegExp(`^\\S*\\s?${name}$`) })).toBeFocused();
  await page.keyboard.press('x');
  await expect(page.getByRole('checkbox', { name: `Select ${name}` })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('checkbox', { name: `Select ${name}` })).not.toBeChecked();
});
