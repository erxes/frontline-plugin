import type { Page } from '@playwright/test';
import { callProLine, expect, expectAccessible, recordPanel, test, unique } from './fixtures.ts';

const HISTORY = '/frontline/calls/history';

/** Narrows the list with the filter bar: `field` is `option`. */
const filterBy = async (page: Page, field: string, option: string) => {
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('option', { name: field, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await page.keyboard.press('Escape');
};

test('calls from a phone line show in the call history as they happen, and open in the side panel', async ({
  page,
  api,
}) => {
  const answered = `9911${String(Date.now()).slice(-4)}`;
  const missed = `8800${String(Date.now()).slice(-4)}`;
  const later = `9500${String(Date.now()).slice(-4)}`;
  const post = await callProLine(api, page.request, `7555${String(Date.now()).slice(-4)}`);

  await post(`a-${unique()}`, missed, 'NO ANSWER');

  const call = `b-${unique()}`;

  await post(call, answered, 'RINGING');
  await post(call, answered, 'ANSWERED');

  // Calls opens on its history.
  await page.goto('/frontline/calls');
  await expect(page).toHaveURL(new RegExp(`${HISTORY}$`));

  const rowOf = (phone: string) => page.getByRole('row').filter({ hasText: phone });

  await expect(rowOf(answered)).toContainText('Answered');
  await expect(rowOf(missed)).toContainText('Missed');
  await expectAccessible(page);

  // A call that comes in while the page is open shows without a reload.
  await post(`c-${unique()}`, later, 'RINGING');
  await expect(rowOf(later)).toContainText('Ringing');

  // The filter keeps the missed calls, and survives a reload.
  await filterBy(page, 'Status', 'Missed');
  await expect(rowOf(missed)).toBeVisible();
  await expect(rowOf(answered)).toHaveCount(0);
  await page.reload();
  await expect(rowOf(missed)).toBeVisible();
  await expect(rowOf(answered)).toHaveCount(0);

  // The answered call opens in core's side panel, with its fields and its conversation.
  await page.goto(HISTORY);
  await rowOf(answered)
    .getByRole('button', { name: new RegExp(answered) })
    .first()
    .click();

  const panel = recordPanel(page);

  await expect(panel).toContainText('Answered');
  await expect(panel).toContainText('Incoming');
  await expect(panel).toContainText('No recording');
  await expect(panel.getByRole('link', { name: 'Open in inbox' })).toBeVisible();
  await expectAccessible(page);

  await panel.getByRole('link', { name: 'Open in inbox' }).click();
  await expect(page).toHaveURL(/\/frontline\/inbox\?conversationId=/);
  await expect(page.getByText(`Incoming call from ${answered}`).first()).toBeVisible();
});

test('the queues dashboard lists the queues of the PBXs the member answers', async ({ page }) => {
  // The old dashboard's address opens the queues.
  await page.goto('/frontline/calls/dashboard');
  await expect(page).toHaveURL(/\/frontline\/calls\/queues$/);
  await expect(page.getByText('No queues yet')).toBeVisible();
  await expectAccessible(page);
});

test('a member without the call permission is refused the calls', async ({ newMember }) => {
  const { page } = await newMember(['team.view']);

  await page.goto(HISTORY);
  await expect(page.getByText('You need the frontline.call.view permission')).toBeVisible();
  await expectAccessible(page);

  await page.goto('/frontline/calls/queues');
  await expect(page.getByText('You need the frontline.call.view permission')).toBeVisible();
});
