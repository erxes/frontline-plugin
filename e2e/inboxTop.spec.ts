import { addMessenger, createChannel, expect, INBOX, test, unique, visitorOf } from './fixtures.ts';

test('a member far down the inbox goes back to the newest conversations at once', async ({
  page,
  plugin,
  request,
}) => {
  const channel = await createChannel(page);
  const suffix = unique();

  await page.goto(INBOX);

  const key = await addMessenger(page, channel);

  for (let index = 0; index < 20; index += 1)
    await (await visitorOf(request, plugin, key)).write(`Question ${index} ${suffix}`);

  // A short window, so twenty conversations scroll well past the point the button shows.
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto(`${INBOX}?${new URLSearchParams({ searchValue: suffix })}`);

  const conversations = page.getByRole('list', { name: 'Conversations' });
  const newest = conversations.getByRole('listitem').filter({ hasText: `Question 19 ${suffix}` });
  const back = page.getByRole('button', { name: 'Back to top' });

  await expect(newest).toBeVisible();
  await expect(back).toBeHidden();

  // The list's own scroll box, scrolled to its end.
  await conversations.evaluate((list) => {
    let box = list.parentElement;

    while (box && box.scrollHeight <= box.clientHeight) box = box.parentElement;

    box?.scrollTo({ top: box.scrollHeight });
  });

  await expect(back).toBeVisible();
  await back.click();

  await expect(newest).toBeInViewport();
  await expect(back).toBeHidden();
});
