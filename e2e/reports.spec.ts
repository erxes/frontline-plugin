import { addTiles, callProLine, expect, test, tileOf, unique } from './fixtures.ts';

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

test('a member without the call permission sees the refusal in the call tile', async ({
  newMember,
}) => {
  const { page } = await newMember(['team.view']);

  await addTiles(page, ['Call summary']);

  await expect(tileOf(page, 'Call summary').getByRole('alert')).toHaveText(
    'You need the frontline.call.view permission',
  );
});
