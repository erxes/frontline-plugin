import type { Page } from '@playwright/test';
import {
  addMessenger,
  createChannel,
  expect,
  expectAccessible,
  INBOX,
  test,
  unique,
  visitorOf,
} from './fixtures.ts';

/** The inbox narrowed by its search, which lives in the address. */
const search = (page: Page, value: string, status?: string) => {
  const advanced = status
    ? JSON.stringify({
        match: 'all',
        rules: [{ path: 'subject.status', op: 'in', value: [status] }],
      })
    : undefined;

  return page.goto(
    `${INBOX}?${new URLSearchParams({ searchValue: value, ...(advanced && { advanced }) })}`,
  );
};

test('a member finds a customer by email, then tags, resolves and assigns their conversations together', async ({
  page,
  request,
  newMember,
}) => {
  const teammate = await newMember(['frontline.inbox.view']);
  const outsider = await newMember(['frontline.inbox.view']);
  const channel = await createChannel(page, teammate.fullName);
  const suffix = unique();
  const name = `Grace ${suffix}`;
  const email = `grace-${suffix}@e2e.test`;
  const tag = `Returns ${suffix}`;

  await page.goto(INBOX);

  const key = await addMessenger(page, channel);
  const grace = await visitorOf(request, key, { email, firstName: name });

  await grace.write(`Wrong size ${suffix}`);
  await grace.write(`Late refund ${suffix}`);
  await (await visitorOf(request, key)).write(`Another visitor ${suffix}`);

  // The search matches the customer's email through core, so only Grace's two show.
  const conversations = page.getByRole('list', { name: 'Conversations' });
  const picks = conversations.getByRole('checkbox', { name: `Select ${name}` });

  await search(page, email);
  await expect(conversations.getByRole('listitem')).toHaveCount(2);
  await expectAccessible(page);

  // Picked rows get the bar: a tag made in its picker lands on both. axe runs only while the bar
  // is closed: its dialog has no name (https://github.com/erxes/erxes/issues/10610).
  await picks.nth(0).click();
  await picks.nth(1).click();
  await expect(page.getByText('2 selected')).toBeVisible();
  await page.getByRole('button', { name: 'Tag', exact: true }).click();
  await page.getByPlaceholder('Search tags').fill(tag);
  await page.getByRole('button', { name: `Create tag: ${tag}` }).click();
  await page.keyboard.press('Escape');

  // The teammate in the channel finds the tag on each.
  await search(teammate.page, email);

  for (const content of [`Wrong size ${suffix}`, `Late refund ${suffix}`]) {
    await teammate.page
      .getByRole('list', { name: 'Conversations' })
      .getByRole('button', { name: new RegExp(content) })
      .click();
    await expect(
      teammate.page.getByRole('region', { name: 'Conversation' }).locator('header'),
    ).toContainText(tag);
  }

  // Resolve takes both out of the list; the status filter shows them resolved.
  await page.getByRole('button', { name: 'Resolve', exact: true }).click();
  await expect(conversations.getByRole('listitem')).toHaveCount(0);
  await search(page, email, 'resolved');
  await expect(conversations.getByRole('listitem')).toHaveCount(2);
  await expect(conversations.getByText('Resolved')).toHaveCount(2);
  await expectAccessible(page);

  // A member outside the channel finds none of them.
  await search(outsider.page, email);
  await expect(outsider.page.getByText('No results found')).toBeVisible();

  // Assign both to the teammate in one go.
  await picks.nth(0).click();
  await picks.nth(1).click();
  await page.getByRole('button', { name: 'Assign', exact: true }).click();
  await page.getByRole('option', { name: teammate.fullName }).click();
  await expect(conversations.getByText(teammate.fullName)).toHaveCount(2);
});
