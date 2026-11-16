import {
  addMessenger,
  createChannel,
  expect,
  expectAccessible,
  INBOX,
  OWNER,
  test,
  unique,
  visitorOf,
} from './fixtures.ts';

test('the sidebar’s queues and channels filter the inbox and count what waits unread, live', async ({
  page,
  request,
}) => {
  const channel = await createChannel(page);
  const refund = `Refund for ${unique()}`;

  await page.goto(INBOX);

  const visitor = await visitorOf(request, await addMessenger(page, channel));

  await visitor.write(refund);
  await page.goto(INBOX);

  const queues = page.getByRole('list', { name: 'Work queue' });
  const conversations = page.getByRole('list', { name: 'Conversations' });
  const row = conversations.getByRole('button', { name: new RegExp(refund) });

  const channelLink = page
    .getByRole('list', { name: 'Channels' })
    .getByRole('link', { name: new RegExp(`^${channel}`) });

  await expect(channelLink.getByLabel('1 unread')).toBeVisible();
  await expectAccessible(page);

  // Another conversation in the channel raises its count without a reload.
  await visitor.write(`Where is my parcel ${unique()}`);
  await expect(channelLink.getByLabel('2 unread')).toBeVisible();

  // The channel's link narrows the inbox to it, as the filter bar's channel rule does.
  await channelLink.click();
  await expect(page).toHaveURL(/advanced=.*channelId/);
  await expect(conversations.getByRole('listitem')).toHaveCount(2);
  await expect(channelLink).toHaveAttribute('data-active', 'true');

  // A new conversation waits in Unassigned and Awaiting response.
  await queues.getByRole('link', { name: /^Unassigned/ }).click();
  await expect(row).toBeVisible();
  await queues.getByRole('link', { name: /^Awaiting response/ }).click();
  await expect(row).toBeVisible();
  await expectAccessible(page);

  // Opening it reads it. Mentions filters by the member's mentions; a second click clears it.
  await row.click();
  await expect(channelLink.getByLabel('1 unread')).toBeVisible();
  await queues.getByRole('link', { name: /^Mentions/ }).click();
  await expect(page).toHaveURL(/mentionedUserIds/);
  await queues.getByRole('link', { name: /^Mentions/ }).click();
  await expect(page).toHaveURL(new RegExp(`${INBOX}$`));

  // Once assigned to the member, it shows under Assigned to me.
  await channelLink.click();
  await row.click();
  await page.getByRole('button', { name: 'Assign', exact: true }).click();
  await page.getByRole('option', { name: `${OWNER.firstName} ${OWNER.lastName}` }).click();
  await queues.getByRole('link', { name: /^Assigned to me/ }).click();
  await expect(page).toHaveURL(/assigneeId/);
  await expect(row).toBeVisible();
});
