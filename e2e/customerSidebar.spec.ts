import {
  addMessenger,
  createPipeline,
  expect,
  expectAccessible,
  INBOX,
  openChannelPipelines,
  pick,
  recordPanel,
  test,
  unique,
  visitorOf,
} from './fixtures.ts';

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

  const sidebar = page.getByRole('complementary', { name: 'Customer details' });

  await expect(sidebar.getByText(name)).toBeVisible();
  await expect(sidebar.getByText(email)).toBeVisible();
  await expect(sidebar.getByRole('button', { name: new RegExp(ticket) })).toBeVisible();
  await expectAccessible(page);

  // Another conversation of the customer opens in its place.
  await sidebar.getByRole('button', { name: new RegExp(earlier) }).click();
  await expect(page).toHaveURL(new RegExp(`conversationId=${earlierId}`));
  await expect(page.getByRole('list', { name: 'Messages' })).toContainText(earlier);

  // The teammate sees the customer's conversations, but neither their contact details, which
  // need core's contacts permission, nor their tickets.
  const theirs = teammate.page.getByRole('complementary', { name: 'Customer details' });

  await teammate.page.goto(`${INBOX}?conversationId=${openId}`);
  await expect(theirs.getByRole('button', { name: new RegExp(earlier) })).toBeVisible();
  await expect(theirs.getByText(email)).toBeHidden();
  await expect(theirs.getByRole('heading', { name: 'Tickets' })).toBeHidden();
});
