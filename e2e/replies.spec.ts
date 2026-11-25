import type { Page } from '@playwright/test';
import {
  addMessenger,
  createChannel,
  expect,
  expectAccessible,
  expectPage,
  INBOX,
  OWNER,
  test,
  unique,
  visitorOf,
} from './fixtures.ts';
import { channelSections } from './channelSettings.ts';

/** The open channel's Replies section, from any of its settings pages. */
const openReplies = async (page: Page) => {
  await channelSections(page).getByRole('link', { name: 'Replies' }).click();
  await expectPage(page, 'Replies');
};

test('a channel admin sets its reply rules, and a waiting customer’s conversation goes to them with its reply due', async ({
  page,
  plugin,
  request,
}) => {
  const channel = await createChannel(page);

  await openReplies(page);
  await page.getByLabel('First reply, minutes').fill('30');
  await page.getByLabel('Next replies, minutes').fill('10');
  await page.getByLabel('Warn before, minutes').fill('5');
  await page.getByRole('switch', { name: 'Assign automatically' }).click();
  await page.getByLabel('Reassign after, minutes').fill('0');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('A whole number from 1 to 43200')).toBeVisible();

  await page.getByLabel('Reassign after, minutes').fill('15');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Reply rules saved')).toBeVisible();
  await expectAccessible(page, page.getByLabel('Away message'));

  await page.reload();
  await expect(page.getByLabel('First reply, minutes')).toHaveValue('30');
  await expect(page.getByRole('switch', { name: 'Assign automatically' })).toBeChecked();

  await page.goto(INBOX);

  const visitor = await visitorOf(request, plugin, await addMessenger(page, channel));
  const asked = `Where is order ${unique()}?`;

  await visitor.write(asked);
  await page.goto(INBOX);
  await page
    .getByRole('list', { name: 'Conversations' })
    .getByRole('button', { name: new RegExp(asked) })
    .click();

  // The owner is the channel's only available member, so it went to them, due in half an hour.
  const header = page.getByRole('region', { name: 'Conversation' }).locator('header');

  await expect(
    header.getByRole('button', { name: `${OWNER.firstName} ${OWNER.lastName}` }),
  ).toBeVisible();
  await expect(header.getByText(/Reply due in (29|30) min/)).toBeVisible();

  // A reply stops the clock.
  await page.getByRole('textbox', { name: 'Reply' }).fill('It ships today.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(header.getByText(/Reply due in/)).toBeHidden();
});

test('a member goes away from the inbox and comes back', async ({ page }) => {
  await page.goto(INBOX);

  const status = page.getByRole('button', { name: /^(Available|Away)$/ });

  // Start from available, whatever another test left.
  if ((await status.textContent()) === 'Away') await status.click();
  await expect(status).toHaveText('Available');

  await status.click();
  await expect(status).toHaveText('Away');
  await expect(status).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(status).toHaveText('Away');

  await status.click();
  await expect(status).toHaveText('Available');
  await expectAccessible(page, status);
});

test('a channel member who isn’t its admin reads its reply rules without changing them', async ({
  page,
  newMember,
}) => {
  const member = await newMember(['frontline.channel.view', 'frontline.inbox.view']);

  await createChannel(page, member.fullName);
  await openReplies(page);

  await member.page.goto(page.url());
  await expectPage(member.page, 'Replies');
  await expect(member.page.getByLabel('First reply, minutes')).toBeDisabled();
  await expect(member.page.getByRole('button', { name: 'Save' })).toBeHidden();
  await expectAccessible(member.page, member.page.getByLabel('Away message'));
});
