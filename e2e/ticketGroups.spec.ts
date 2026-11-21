import { z } from 'zod';
import { expect, Id, pluginApi, test, unique } from './fixtures.ts';

/** A pipeline's statuses, by name. */
const Choices = z.object({
  statuses: z.array(z.object({ id: z.string(), pipelineId: z.string(), name: z.string() })),
});

/** The group header's fold button: the status's name and its count. */
const header = (count: number) => new RegExp(`^New\\s*${count}$`);

test('each status of the list loads its own tickets, more as it scrolls', async ({
  page,
  api,
  request,
}) => {
  const rpc = await pluginApi(api, request);
  const { id: channelId } = await rpc('channels/create', { name: `Support ${unique()}` }, Id);
  const pipeline = { channelId, name: `Returns ${unique()}` };
  const { id: pipelineId } = await rpc('pipelines/create', pipeline, Id);
  const { statuses } = await rpc('pipelines/choices', {}, Choices);

  const statusId = (name: string) =>
    statuses.find((status) => status.pipelineId === pipelineId && status.name === name)?.id;

  // The closed ticket changed first, so one page of the newest holds only New's 51.
  const closed = `Closed ${unique()}`;

  await rpc('tickets/create', { pipelineId, statusId: statusId('Closed'), name: closed }, Id);

  for (let index = 0; index < 51; index += 1) {
    await rpc(
      'tickets/create',
      { pipelineId, statusId: statusId('New'), name: `Ask ${index}` },
      Id,
    );
  }

  await page.goto(`/frontline/tickets?pipeline=${pipelineId}`);

  const fresh = page.getByRole('region', { name: 'New' });

  await expect(page.getByRole('region', { name: 'Closed' })).toContainText(closed);
  await expect(fresh.getByRole('button', { name: header(51) })).toBeVisible();
  await expect(fresh.getByRole('listitem')).toHaveCount(50);

  // The group's end coming into view loads its next page.
  await fresh.getByRole('listitem').last().scrollIntoViewIfNeeded();
  await expect(fresh.getByRole('listitem')).toHaveCount(51);

  // A folded group keeps its count and shows no rows; unfolded, it shows them again.
  await fresh.getByRole('button', { name: header(51) }).click();
  await expect(fresh.getByRole('listitem')).toHaveCount(0);
  await fresh.getByRole('button', { name: header(51) }).click();
  await expect(fresh.getByRole('listitem')).toHaveCount(51);
});
