import { z } from 'zod';
import {
  addTiles,
  callProLine,
  expect,
  Id,
  messengerIn,
  pick,
  pluginApi,
  test,
  tileOf,
  unique,
  visitorOf,
} from './fixtures.ts';

test('call, ticket and conversation tiles on the home dashboard count the period, and keep their place', async ({
  page,
  api,
}) => {
  const caller = `9911${String(Date.now()).slice(-4)}`;
  const post = await callProLine(api, page.request, `7555${String(Date.now()).slice(-4)}`);

  // The caller calls three times: two answered, one missed, so they top the numbers.
  for (const disp of ['ANSWERED', 'ANSWERED', 'NO ANSWER']) {
    const call = `r-${unique()}`;

    await post(call, caller, 'RINGING');
    await post(call, caller, disp);
  }

  await addTiles(page, [
    'Top numbers',
    'Call summary',
    'Ticket summary',
    'Conversations over time',
  ]);

  const numbers = tileOf(page, 'Top numbers');
  const row = numbers.getByRole('row').filter({ hasText: caller });

  await expect(row.getByRole('cell')).toHaveText([caller, '3', '2', '1']);
  await expect(tileOf(page, 'Call summary')).toContainText('Service level');
  await expect(tileOf(page, 'Ticket summary')).toContainText('Overdue now');
  await expect(tileOf(page, 'Conversations over time').getByRole('alert')).toHaveCount(0);

  // Each tile picks its own period; today's calls are in the last 7 days too.
  await numbers.getByRole('button', { name: 'Last 7 days' }).click();
  await expect(numbers.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(row.getByRole('cell')).toHaveText([caller, '3', '2', '1']);

  // Core keeps the layout, so the tiles are still there after a reload.
  await page.reload();
  await expect(
    tileOf(page, 'Top numbers').getByRole('row').filter({ hasText: caller }),
  ).toBeVisible();
  await expect(tileOf(page, 'Ticket summary')).toBeVisible();
});

test('a ticket tile number opens the tickets it counts', async ({ page, api, request }) => {
  const rpc = await pluginApi(api, request);
  const channel = await rpc('channels/create', { name: `Counted ${unique()}` }, Id);
  const pipeline = `Counted ${unique()}`;

  const { id: pipelineId } = await rpc(
    'pipelines/create',
    { channelId: channel.id, name: pipeline },
    Id,
  );

  const { statuses } = await rpc(
    'pipelines/choices',
    {},
    z.object({
      statuses: z.array(z.object({ id: z.string(), pipelineId: z.string(), type: z.number() })),
    }),
  );

  const [first, done] = [1, 4].map(
    (type) =>
      statuses.find((status) => status.pipelineId === pipelineId && status.type === type)?.id ?? '',
  );

  const [open, resolved] = [`Open ${unique()}`, `Resolved ${unique()}`];

  await rpc('tickets/create', { pipelineId, statusId: first, name: open }, Id);
  await rpc('tickets/create', { pipelineId, statusId: done, name: resolved }, Id);

  await addTiles(page, ['Ticket summary']);

  const tile = tileOf(page, 'Ticket summary');

  await pick(page, tile.getByRole('combobox', { name: 'Pipeline' }), pipeline);
  await expect(tile.getByRole('link', { name: 'Created: 2' })).toBeVisible();

  // Open now leads to the pipeline's tickets in an open status: only the first.
  await tile.getByRole('link', { name: 'Open now: 1' }).click();
  await expect(page).toHaveURL(/\/frontline\/tickets\?/);
  await expect(page.getByText(open)).toBeVisible();
  await expect(page.getByText(resolved)).toHaveCount(0);

  // Created leads to both.
  await page.goBack();
  await tileOf(page, 'Ticket summary').getByRole('link', { name: 'Created: 2' }).click();
  await expect(page.getByText(open)).toBeVisible();
  await expect(page.getByText(resolved)).toBeVisible();
});

test('a conversation tile number opens the conversations it counts in the inbox', async ({
  page,
  api,
  request,
}) => {
  const rpc = await pluginApi(api, request);
  const question = `Counted ${unique()}`;
  const visitor = await visitorOf(request, await messengerIn(rpc, { welcome: 'Hi' }));
  const conversationId = await visitor.write(question);

  // Resolved, so it shows only where the link names every status.
  await rpc('conversations/setStatus', { ids: [conversationId], status: 'resolved' }, z.array(Id));

  await addTiles(page, ['Conversation summary']);

  const tile = tileOf(page, 'Conversation summary');

  await tile.getByRole('link', { name: /^Started: / }).click();
  await expect(page).toHaveURL(/\/frontline\/inbox\?/);
  await expect(page.getByText(question)).toBeVisible();

  await page.goBack();
  await tileOf(page, 'Conversation summary')
    .getByRole('link', { name: /^Resolved: / })
    .click();
  await expect(page.getByText(question)).toBeVisible();
});

test('a member without the call permission sees the refusal in the call tile', async ({
  newMember,
}) => {
  const { page } = await newMember(['team.view']);

  await addTiles(page, ['Call summary']);

  await expect(tileOf(page, 'Call summary').getByRole('alert')).toHaveText(
    'You need the frontline.call.view permission',
  );
});
