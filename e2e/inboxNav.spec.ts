import {
  addMessenger,
  createChannel,
  expect,
  Id,
  INBOX,
  messengerIn,
  pluginApi,
  test,
  unique,
  visitorOf,
} from './fixtures.ts';

// A daily agent: the inbox, their channels, and core's team list to assign from.
const MEMBER = ['frontline.inbox.view', 'frontline.channel.view', 'team.view'];

test('the sidebar’s queues and channels filter the inbox and count what waits unread, live', async ({
  page,
  plugin,
  request,
  newMember,
}) => {
  const teammate = await newMember(MEMBER);
  const channel = await createChannel(page, teammate.fullName);
  const refund = `Refund for ${unique()}`;

  await page.goto(INBOX);

  const visitor = await visitorOf(request, plugin, await addMessenger(page, channel));

  const refundId = await visitor.write(refund);

  const member = teammate.page;

  await member.goto(INBOX);

  const queues = member.getByRole('list', { name: 'Work queue' });
  const conversations = member.getByRole('list', { name: 'Conversations' });
  const row = conversations.getByRole('button', { name: new RegExp(refund) });

  const channels = member.getByRole('list', { name: 'Channels' });
  const channelItem = channels.getByRole('button', { name: new RegExp(`^${channel}`) });
  const channelInbox = channels.getByRole('link', { name: /^Inbox/ });

  await expect(channelItem.getByLabel('1 unread')).toBeVisible();

  // Another conversation in the channel raises its count without a reload.
  const parcelId = await visitor.write(`Where is my parcel ${unique()}`);
  await expect(channelItem.getByLabel('2 unread')).toBeVisible();

  // The channel unfolds to its own pages; its inbox shows only its conversations, under its name.
  await channelItem.click();
  await expect(channelInbox.getByLabel('2 unread')).toBeVisible();
  await channelInbox.click();
  await expect(member).toHaveURL(/\/frontline\/channels\/[^/]+\/inbox$/);
  await expect(member.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(channel);
  await expect(conversations.getByRole('listitem')).toHaveCount(2);
  await expect(channelInbox).toHaveAttribute('data-active', 'true');

  // A new conversation waits in Unassigned and Awaiting response.
  await queues.getByRole('link', { name: /^Unassigned/ }).click();
  await expect(row).toBeVisible();
  await queues.getByRole('link', { name: /^Awaiting response/ }).click();
  await expect(row).toBeVisible();

  // Opening it reads it. Mentions filters by the member's mentions; a second click clears it.
  await row.click();
  await expect(channelInbox.getByLabel('1 unread')).toBeVisible();
  await queues.getByRole('link', { name: /^Mentions/ }).click();
  await expect(member).toHaveURL(/mentionedUserIds/);
  await queues.getByRole('link', { name: /^Mentions/ }).click();
  await expect(member).toHaveURL(new RegExp(`${INBOX}$`));

  // Once assigned to the member, it shows under Assigned to me.
  await channelInbox.click();
  await row.click();
  await member.getByRole('button', { name: 'Assign', exact: true }).click();
  await member.getByRole('option', { name: teammate.fullName }).click();
  await queues.getByRole('link', { name: /^Assigned to me/ }).click();
  await expect(member).toHaveURL(/assigneeId/);
  await expect(row).toContainText(`Assigned to ${teammate.fullName}`);

  // A message into the open conversation is read as it arrives.
  await row.click();

  const followUp = `Any news ${unique()}`;
  const updated = conversations.getByRole('button', { name: new RegExp(followUp) });

  await visitor.write(followUp, refundId);
  await expect(updated).toBeVisible();
  await expect(updated).not.toContainText('Unread');

  // A link straight to a conversation reads it too, and the channel has nothing left unread.
  await member.goto(`${INBOX}?conversationId=${parcelId}`);
  await expect(member.getByRole('region', { name: 'Conversation' })).toContainText(
    'Where is my parcel',
  );
  await expect(channelInbox.getByLabel(/unread/)).toBeHidden();
});

test('Channels lists the member’s own inbox first; quiet channels fold, a filter finds any, and a folded group stays folded', async ({
  plugin,
  request,
  api,
  newMember,
}) => {
  const teammate = await newMember(MEMBER);
  const rpc = await pluginApi(api, request);

  // Nine team channels: more than the sidebar lists before it folds, so the filter shows.
  // They come from the API, since other specs walk the channel and messenger forms.
  const channelOf = async () => {
    const name = `Support ${unique()}`;
    const { id } = await rpc('channels/create', { name, memberIds: [teammate.id] }, Id);

    return { id, name };
  };

  const [{ id: busyId, name: busy }, quiet] = await Promise.all([
    channelOf(),
    Promise.all(Array.from({ length: 8 }, async () => (await channelOf()).name)),
  ]);

  const key = await messengerIn(rpc, { welcome: 'Hi' }, busyId);

  await (await visitorOf(request, plugin, key)).write(`Hello ${unique()}`);

  const member = teammate.page;
  const first = quiet.at(0) ?? '';
  const last = quiet.at(-1) ?? '';

  const menu = member.getByRole('button', { name: 'Channel actions' });

  // The Channels menu makes the member's personal inbox, then opens its settings.
  await member.goto(INBOX);
  await menu.click();
  await member.getByRole('menuitem', { name: 'Create my inbox' }).click();
  await expect(member).toHaveURL(/\/frontline\/channels\/[^/]+\/settings$/);
  await member.goto(INBOX);
  await menu.click();
  await expect(member.getByRole('menuitem', { name: 'Create my inbox' })).toBeHidden();
  await member.keyboard.press('Escape');

  const team = member.getByRole('list', { name: 'Channels' });
  const link = (name: string) => team.getByRole('button', { name: new RegExp(`^${name}`) });

  await expect(link('Personal inbox')).toBeVisible();
  await expect(link(busy).getByLabel('1 unread')).toBeVisible();
  await expect(link(first)).toBeHidden();

  // The quiet channels fold behind one row, and come back.
  await team.getByRole('button', { name: '8 quiet channels' }).click();
  await expect(link(first)).toBeVisible();
  await expect(link(last)).toBeVisible();
  await team.getByRole('button', { name: 'Show fewer channels' }).click();
  await expect(link(last)).toBeHidden();

  // The filter searches every channel, folded or not.
  const filter = team.getByRole('searchbox', { name: 'Filter channels' });

  await filter.fill(last);
  await expect(link(last)).toBeVisible();
  await expect(link(busy)).toBeHidden();
  await filter.fill(`nothing ${unique()}`);
  await expect(team.getByText('No channel matches')).toBeVisible();
  await filter.fill('');

  // A folded group stays folded after a reload.
  await member.getByRole('button', { name: 'Channels', exact: true }).click();
  await expect(team).toBeHidden();
  await member.reload();
  await expect(member.getByRole('list', { name: 'Work queue' })).toBeVisible();
  await expect(team).toBeHidden();
  await member.getByRole('button', { name: 'Channels', exact: true }).click();
  await expect(link(busy)).toBeVisible();

  // Its menu opens the list of channels to manage them.
  await menu.click();
  await member.getByRole('menuitem', { name: 'Manage channels' }).click();
  await expect(member).toHaveURL(/\/frontline\/settings\/channels$/);
});

test('a member without the inbox permission gets the Inbox link and none of its groups', async ({
  newMember,
}) => {
  const { page } = await newMember(['frontline.channel.view']);

  await page.goto('/frontline/tickets');
  await expect(page.getByRole('link', { name: 'Inbox', exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Work queue' })).toBeHidden();
  await expect(page.getByRole('list', { name: 'Channels' })).toBeHidden();
});
