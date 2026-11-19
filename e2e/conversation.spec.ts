import type { Locator } from '@playwright/test';
import {
  addMessenger,
  createChannel,
  createPipeline,
  expect,
  INBOX,
  openChannelPipelines,
  recordPanel,
  test,
  unique,
  visitorOf,
} from './fixtures.ts';

/** Types `day` into the date field as a person does, closes the calendar its click opened and leaves. */
const typeDay = async (field: Locator, day: string) => {
  await field.click();
  await field.pressSequentially(day);
  await field.press('Escape');
  await field.press('Tab');
};

test('a member makes a ticket from the open conversation, which shows it and which it links back to', async ({
  page,
  plugin,
  request,
  newMember,
}) => {
  // The teammate answers the inbox but can't file tickets.
  const teammate = await newMember(['frontline.inbox.view']);
  const channel = await openChannelPipelines(page, teammate.fullName);
  const pipeline = await createPipeline(page);
  const panel = recordPanel(page);
  const suffix = unique();
  const name = `Ada ${suffix}`;
  const question = `Where is my parcel ${suffix}`;

  await page.goto(INBOX);

  const key = await addMessenger(page, channel);

  const visitor = await visitorOf(request, plugin, key, {
    email: `ada-${suffix}@e2e.test`,
    firstName: name,
  });

  await visitor.write(`Hello ${suffix}`);

  const conversationId = await visitor.write(`  ${question}  `);
  const header = page.getByRole('region', { name: 'Conversation' }).locator('header');

  // The draft starts with the customer, their latest message as its name and the channel's one
  // pipeline.
  await page.goto(`${INBOX}?conversationId=${conversationId}`);
  await header.getByRole('button', { name: 'Create ticket' }).click();
  await expect(panel.getByLabel('Name')).toHaveValue(question);
  await expect(panel.getByText(name)).toBeVisible();
  await expect(panel.getByRole('combobox', { name: 'Pipeline' })).toContainText(pipeline);

  // A target date before the start date isn't taken.
  const start = panel.getByRole('textbox', { name: 'Start date' });
  const target = panel.getByRole('textbox', { name: 'Target date' });

  await typeDay(start, '2026-11-05');
  await expect(start).not.toHaveValue('');
  await typeDay(target, '2026-11-03');
  await expect(target).toHaveValue('');
  await typeDay(target, '2026-11-09');
  await expect(target).not.toHaveValue('');
  await panel.getByRole('button', { name: 'Create ticket' }).click();
  await expect(panel.getByRole('button', { name: `Name ${question}` })).toBeVisible();

  // The header shows the conversation's ticket, which opens in core's panel and links back.
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(panel).toBeHidden();
  await header.getByRole('button', { name: `Open ticket ${question}` }).click();
  await expect(panel.getByRole('button', { name: `Name ${question}` })).toBeVisible();
  await panel.getByRole('link', { name: 'Open in the inbox', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`conversationId=${conversationId}`));
  await expect(page.getByRole('list', { name: 'Messages' })).toContainText(question);

  // The teammate reads the conversation but can't make a ticket from it.
  await teammate.page.goto(`${INBOX}?conversationId=${conversationId}`);
  await expect(teammate.page.getByRole('list', { name: 'Messages' })).toContainText(question);
  await expect(teammate.page.getByRole('button', { name: 'Create ticket' })).toBeHidden();
});

test('a conversation opens on its own page with its customer and status, resolves from its menu, and shows its properties', async ({
  page,
  plugin,
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

  const visitor = await visitorOf(request, plugin, key, {
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
  await expect(recordPanel(page).getByText(name).first()).toBeVisible();
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
