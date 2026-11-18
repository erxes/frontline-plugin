import {
  addMessenger,
  createChannel,
  createPipeline,
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

test('the customer, their tickets and their other conversations show beside the open one', async ({
  page,
  request,
  newMember,
}) => {
  // The teammate answers the inbox but can't read the channel's tickets.
  const teammate = await newMember(['frontline.inbox.view']);
  const channel = await openChannelPipelines(page, teammate.fullName);
  const pipeline = await createPipeline(page);
  const panel = recordPanel(page);
  const suffix = unique();
  const name = `Ada ${suffix}`;
  const email = `ada-${suffix}@e2e.test`;
  const ticket = `Lost parcel ${suffix}`;

  await page.goto(INBOX);

  const key = await addMessenger(page, channel);
  const visitor = await visitorOf(request, key, { email, firstName: name });
  const earlier = `Where is my order ${suffix}`;
  const earlierId = await visitor.write(earlier);
  const openId = await visitor.write(`Can I change my address ${suffix}`);

  // A ticket about the customer, filed from the tickets page.
  await page.goto('/frontline/tickets');
  await page.getByRole('button', { name: 'Create ticket' }).first().click();
  await pick(page, panel.getByRole('combobox', { name: 'Pipeline' }), `${channel} › ${pipeline}`);
  await panel.getByLabel('Name').fill(ticket);
  await panel.getByRole('button', { name: 'Create ticket' }).click();
  await panel.getByRole('button', { name: 'Change Customer' }).click();
  await page.getByPlaceholder('Customer').fill(email);
  await page.getByRole('option', { name }).click();
  await expect(panel.getByText(name)).toBeVisible();

  await page.goto(`${INBOX}?conversationId=${openId}`);

  // The panels start closed; each icon on the rail opens one.
  const sidebar = page.getByRole('complementary', { name: 'Customer details' });
  const rail = page.getByRole('toolbar', { name: 'Customer panels' });

  await expect(sidebar).toBeHidden();
  await rail.getByRole('button', { name: 'Customer', exact: true }).click();
  await expect(sidebar.getByText(name)).toBeVisible();
  await expect(sidebar.getByText(email)).toBeVisible();
  await rail.getByRole('button', { name: 'Tickets', exact: true }).click();
  // The Tickets panel lists only a customer's tickets, which this flow files.
  await expectAccessible(page, sidebar.getByRole('button', { name: new RegExp(ticket) }));

  // Another conversation of the customer opens in its place.
  await rail.getByRole('button', { name: 'Other conversations', exact: true }).click();
  await sidebar.getByRole('button', { name: new RegExp(earlier) }).click();
  await expect(page).toHaveURL(new RegExp(`conversationId=${earlierId}`));
  await expect(page.getByRole('list', { name: 'Messages' })).toContainText(earlier);

  // The teammate sees the customer's conversations, but neither their contact details, which
  // need core's contacts permission, nor a Tickets icon.
  const theirs = teammate.page.getByRole('complementary', { name: 'Customer details' });
  const theirRail = teammate.page.getByRole('toolbar', { name: 'Customer panels' });

  await teammate.page.goto(`${INBOX}?conversationId=${openId}`);
  await theirRail.getByRole('button', { name: 'Other conversations', exact: true }).click();
  await expect(theirs.getByRole('button', { name: new RegExp(earlier) })).toBeVisible();
  await expect(theirRail.getByRole('button', { name: 'Tickets', exact: true })).toBeHidden();
  await theirRail.getByRole('button', { name: 'Customer', exact: true }).click();
  await expect(theirs.getByText(email)).toBeHidden();
});

test('a conversation opens on its own page with its customer and status, resolves from its menu, and shows its properties', async ({
  page,
  request,
  newMember,
}) => {
  const channel = await createChannel(page);
  const suffix = unique();
  const name = `Bat ${suffix}`;

  await page.goto(INBOX);
  // Without a mailbox in a channel there is no mail to write.
  await expect(page.getByRole('button', { name: 'New mail' })).toBeHidden();

  const key = await addMessenger(page, channel);

  const visitor = await visitorOf(request, key, {
    email: `bat-${suffix}@e2e.test`,
    firstName: name,
  });

  const conversationId = await visitor.write(`Is the shop open on Sunday ${suffix}`);
  const path = `${INBOX}/conversations/${conversationId}`;

  await page.goto(path);
  await expect(page.getByText(name).first()).toBeVisible();
  await expect(page.getByText('New', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Conversation actions' }).click();
  await page.getByRole('option', { name: 'Resolve' }).click();
  await expect(page.getByText('Resolved', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: /Open in the inbox/ }).click();
  await expect(page).toHaveURL(new RegExp(`conversationId=${conversationId}`));

  // The inbox opens the same record in core's panel, with the custom fields core keeps.
  await page.getByRole('button', { name: 'Details and properties' }).click();
  await page.getByRole('tab', { name: 'Properties' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Properties' })).toBeVisible();

  // A member without the inbox permission reads none of it.
  const outsider = await newMember(['frontline.channel.view']);

  await outsider.page.goto(path);
  await expect(
    outsider.page.getByText('You need the frontline.inbox.view permission').first(),
  ).toBeVisible();
  await expect(outsider.page.getByText(name)).toBeHidden();
});
