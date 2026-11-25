import type { Page } from '@playwright/test';
import {
  callProLine,
  expect,
  expectPage,
  filterBy,
  recordPanel,
  test,
  unique,
} from './fixtures.ts';

const HISTORY = '/frontline/calls/history';
const PHONE = '/frontline/calls/phone';
const CALLBACKS = '/frontline/calls/callbacks';

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

  await panel.getByRole('link', { name: 'Open in inbox' }).click();
  await expect(page).toHaveURL(/\/frontline\/inbox\?conversationId=/);
  await expectPage(page, 'Inbox');
  await expect(page.getByText(`Incoming call from ${answered}`).first()).toBeVisible();
});

test('callers nobody talked to wait in Callbacks until someone does', async ({ page, api }) => {
  const caller = `8812${String(Date.now()).slice(-4)}`;
  const reached = `9512${String(Date.now()).slice(-4)}`;
  const post = await callProLine(api, page.request, `7558${String(Date.now()).slice(-4)}`);

  await post(`a-${unique()}`, caller, 'NO ANSWER');
  await post(`b-${unique()}`, caller, 'NO ANSWER');
  await post(`c-${unique()}`, reached, 'ANSWERED');

  await page.goto(CALLBACKS);
  await expectPage(page, 'Callbacks');

  // A row by its Call back button: the customer's cell shows the number once core answers.
  const rowOf = (phone: string) =>
    page.getByRole('row').filter({ has: page.getByRole('button', { name: `Call back ${phone}` }) });

  // One row a caller, with how often they rang; an answered caller has none.
  await expect(rowOf(caller)).toHaveCount(1);
  await expect(rowOf(caller)).toContainText('2');
  await expect(rowOf(reached)).toHaveCount(0);
  // Calling back needs a softphone on the line.
  await expect(rowOf(caller).getByRole('button', { name: `Call back ${caller}` })).toBeDisabled();

  // Someone talks to the caller: the row goes without a reload.
  await post(`d-${unique()}`, caller, 'ANSWERED');
  await expect(rowOf(caller)).toHaveCount(0);
});

test('the queues dashboard lists the queues of the PBXs the member answers', async ({ page }) => {
  // The old dashboard's address opens the queues.
  await page.goto('/frontline/calls/dashboard');
  await expect(page).toHaveURL(/\/frontline\/calls\/queues$/);
  await expect(page.getByText('No queues yet')).toBeVisible();
});

/** The softphone's ask for the member's SIP lines, which core's floating widget makes on load. */
const linesAsked = (page: Page) =>
  page.waitForResponse((response) => response.url().includes('/rpc/calls/phone/lines'));

test('the softphone asks for the SIP lines of the member on every page, and shows none without one', async ({
  page,
}) => {
  const asked = linesAsked(page);

  await page.goto('/frontline/inbox');

  const lines = await asked;

  expect(lines.status()).toBe(200);
  expect(await lines.json()).toMatchObject({ json: [] });
  await expect(page.getByRole('button', { name: 'Phone', exact: true })).toHaveCount(0);

  await page.goto(PHONE);
  await expect(page.getByText('You have no phone line')).toBeVisible();
});

test('a member without the call permission is refused the calls', async ({ newMember }) => {
  const { page } = await newMember(['team.view']);
  const asked = linesAsked(page);

  await page.goto('/frontline/inbox');
  expect((await asked).status()).toBe(403);
  await expect(page.getByRole('button', { name: 'Phone', exact: true })).toHaveCount(0);

  await page.goto(HISTORY);
  await expect(page.getByText('You need the frontline.call.view permission')).toBeVisible();

  await page.goto('/frontline/calls/queues');
  await expect(page.getByText('You need the frontline.call.view permission')).toBeVisible();

  await page.goto(CALLBACKS);
  await expect(page.getByText('You need the frontline.call.view permission')).toBeVisible();

  await page.goto(PHONE);
  await expect(page.getByText('You need the frontline.call.view permission')).toBeVisible();
});
