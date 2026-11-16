import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { z } from 'zod';
import {
  confirmDelete,
  expect,
  expectAccessible,
  openChannelPipelines,
  recordPanel,
  test,
  unique,
} from './fixtures.ts';

const FORMS = '/frontline/forms';

/** What the public address gives a visitor: the fields, by id. */
const Shown = z.object({ fields: z.array(z.object({ id: z.string(), label: z.string() })) });

/** Opens `select` and picks `option` in it. */
const pick = async (page: Page, select: Locator, option: string) => {
  await select.click();
  await page.getByRole('option', { name: option, exact: true }).click();
};

/** Opens the in-place text `name`, types `value` and saves it with Enter. */
const retype = async (page: Page, button: Locator, placeholder: string, value: string) => {
  await button.click();
  await page.getByPlaceholder(placeholder, { exact: true }).fill(value);
  await page.keyboard.press('Enter');
};

/** Narrows the list with the filter bar: `field` is one of `option`. */
const filterBy = async (page: Page, field: string, option: string) => {
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('option', { name: field, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await page.keyboard.press('Escape');
};

/** Adds a field of `type` to the first step and names it `label`. */
const addField = async (page: Page, type: string, label: string) => {
  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByRole('option', { name: type, exact: true }).click();
  await retype(page, page.getByRole('button', { name: type, exact: true }), 'Label', label);
  await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
};

/**
 * On the builder: a Plan dropdown, and a Seats number shown only for the Team plan, which the
 * preview hides until Team is picked in it.
 */
const buildFields = async (page: Page) => {
  await addField(page, 'Dropdown', 'Plan');
  await page.getByRole('button', { name: 'Settings of Plan' }).click();
  await page.getByPlaceholder('Type an option and press Enter').fill('Free');
  await page.keyboard.press('Enter');
  await page.getByPlaceholder('Type an option and press Enter').fill('Team');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Settings of Plan' }).click();
  await addField(page, 'Number', 'Seats');
  await page.getByRole('button', { name: 'Settings of Seats' }).click();
  await pick(page, page.getByRole('combobox', { name: 'Shows' }), 'Only when every rule holds');
  await page.getByRole('button', { name: 'Add rule' }).click();
  await pick(page, page.getByRole('combobox', { name: 'Comparison' }), 'is');
  await page.getByRole('textbox', { name: 'Value' }).fill('Team');
  await page.keyboard.press('Tab');

  const preview = page.getByRole('region', { name: 'Preview' });

  await expect(preview.getByText('Book a demo')).toBeVisible();
  await expect(preview.getByLabel('Seats')).toBeHidden();
  await pick(page, preview.getByRole('combobox', { name: 'Plan' }), 'Team');
  await expect(preview.getByLabel('Seats')).toBeVisible();
  await expectAccessible(page);
};

/** Sends the form as a visitor from its public address; a hidden field's answer drops. */
const sendAsVisitor = async (page: Page, request: APIRequestContext, name: string) => {
  const panel = recordPanel(page);

  await page.goto(FORMS);
  await page.getByRole('button', { name, exact: true }).click();
  await panel.getByRole('button', { name: 'Show address' }).click();

  const url = (await panel.getByText(/\/api\/public\//).textContent()) ?? '';
  const shown = await request.get(url);
  const { fields } = Shown.parse(await shown.json());
  const idOf = (label: string) => fields.find((field) => field.label === label)?.id ?? '';

  expect(shown.status()).toBe(200);
  expect(
    (
      await request.post(url, { data: { answers: { [idOf('Plan')]: 'Free', [idOf('Seats')]: 9 } } })
    ).status(),
  ).toBe(201);
  expect(
    (
      await request.post(url, { data: { answers: { [idOf('Plan')]: 'Team', [idOf('Seats')]: 5 } } })
    ).status(),
  ).toBe(201);
  expect(
    (await request.post(url, { data: { answers: { [idOf('Plan')]: 'Gold' } } })).status(),
  ).toBe(422);
};

test('an admin builds a form, a visitor sends it, and the admin corrects and deletes the answers', async ({
  page,
  request,
}) => {
  const channel = await openChannelPipelines(page);
  const panel = recordPanel(page);
  const name = `Demo request ${unique()}`;

  // New form drafts one in core's side panel; it then opens there, edited in place.
  await page.goto(FORMS);
  await page.getByRole('button', { name: 'New form' }).first().click();
  await pick(page, panel.getByRole('combobox', { name: 'Channel' }), channel);
  await panel.getByLabel('Name', { exact: true }).fill(name);
  await panel.getByLabel('Form title').fill('Book a demo');
  await expectAccessible(page);
  await panel.getByRole('button', { name: 'Create form' }).click();
  await expect(panel.getByRole('button', { name: `Name ${name}`, exact: true })).toBeVisible();
  await retype(page, panel.getByRole('button', { name: /^Button text/ }), 'Button text', 'Ask');
  await expect(panel.getByRole('button', { name: 'Button text Ask' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Active' }).getByRole('button', { name, exact: true }),
  ).toBeVisible();
  await expectAccessible(page);

  await panel.getByRole('tab', { name: 'Activity' }).click();
  await expect(panel.getByText(`Created ${name}`)).toBeVisible();
  await panel.getByRole('tab', { name: 'Detail' }).click();

  // The builder edits fields in place; its preview applies their show rules as it is filled in.
  await panel.getByRole('link', { name: /^Fields/ }).click();
  await expect(page).toHaveURL(/\/builder$/);
  await buildFields(page);

  // A visitor reads the form from its public address and sends it.
  await sendAsVisitor(page, request, name);

  // The submissions table has a column per field, and the filter bar one filter per field.
  await page.reload();
  await panel.getByRole('link', { name: /^Submissions/ }).click();
  await expect(page).toHaveURL(/\/submissions$/);

  const team = page.getByRole('row', { name: /Team/ });
  const free = page.getByRole('row', { name: /Free/ });

  // The Free plan hides Seats, so its 9 seats were dropped.
  await expect(team.getByRole('cell', { name: '5', exact: true })).toBeVisible();
  await expect(free.getByRole('cell', { name: '9', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('option', { name: 'Plan', exact: true }).click();
  await page.getByPlaceholder('Contains…').fill('team');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/subject\.answer\./);
  await expect(free).toBeHidden();
  await page.getByRole('button', { name: 'Remove filter' }).click();
  await expect(free).toBeVisible();
  await expectAccessible(page);

  // A submission opens in the panel, where an answer is corrected and the submission deleted.
  await team.getByRole('button', { name: 'Submission actions' }).click();
  await page.getByRole('option', { name: 'Open' }).click();
  await expect(page.getByRole('option', { name: 'Open' })).toBeHidden();
  await retype(page, panel.getByRole('button', { name: 'Seats 5' }), 'Seats', '7');
  await expect(panel.getByRole('button', { name: 'Seats 7' })).toBeVisible();
  await expect(team.getByRole('cell', { name: '7', exact: true })).toBeVisible();
  await expectAccessible(page);
  await panel.getByRole('button', { name: 'Submission actions' }).click();
  await page.getByRole('option', { name: 'Delete' }).click();
  await confirmDelete(page);
  await expect(team).toBeHidden();
});

test('a channel member reads a form and its submissions but changes neither', async ({
  page,
  newMember,
}) => {
  const teammate = await newMember(['frontline.channel.view']);
  const channel = await openChannelPipelines(page, teammate.fullName);
  const panel = recordPanel(page);
  const name = `Contact us ${unique()}`;

  await page.goto(FORMS);
  await page.getByRole('button', { name: 'New form' }).first().click();
  await pick(page, panel.getByRole('combobox', { name: 'Channel' }), channel);
  await panel.getByLabel('Name', { exact: true }).fill(name);
  await panel.getByRole('button', { name: 'Create form' }).click();
  await expect(panel.getByRole('button', { name: `Name ${name}`, exact: true })).toBeVisible();

  await teammate.page.goto(FORMS);
  await teammate.page.getByRole('button', { name: `Actions for ${name}` }).click();
  await expect(teammate.page.getByRole('option', { name: 'Submissions' })).toBeVisible();
  await expect(teammate.page.getByRole('option', { name: 'Delete' })).toBeHidden();
  await teammate.page.keyboard.press('Escape');
  await teammate.page.getByRole('button', { name, exact: true }).click();
  const theirs = recordPanel(teammate.page);

  await expect(theirs.getByRole('button', { name: `Name ${name}`, exact: true })).toBeDisabled();
  await expect(theirs.getByRole('combobox', { name: 'Channel' })).toHaveText(channel);
  await expectAccessible(teammate.page);
});

test('an admin duplicates, archives and deletes forms', async ({ page }) => {
  const channel = await openChannelPipelines(page);
  const panel = recordPanel(page);
  const name = `Feedback ${unique()}`;

  await page.goto(FORMS);
  await page.getByRole('button', { name: 'New form' }).first().click();
  await pick(page, panel.getByRole('combobox', { name: 'Channel' }), channel);
  await panel.getByLabel('Name', { exact: true }).fill(name);
  await panel.getByRole('button', { name: 'Create form' }).click();
  await expect(panel.getByRole('button', { name: `Name ${name}`, exact: true })).toBeVisible();

  await page.getByRole('button', { name: `Actions for ${name}` }).click();
  await page.getByRole('option', { name: 'Duplicate' }).click();
  await expect(page.getByRole('option', { name: 'Duplicate' })).toBeHidden();
  await expect(page.getByRole('button', { name: `${name} (copy)`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Actions for ${name} (copy)` }).click();
  await page.getByRole('option', { name: 'Archive' }).click();
  await expect(
    page
      .getByRole('region', { name: 'Archived' })
      .getByRole('button', { name: `${name} (copy)`, exact: true }),
  ).toBeVisible();
  await expectAccessible(page);

  // Narrowed to its channel, the table's bar deletes both.
  await filterBy(page, 'Channel', channel);
  await page.getByRole('button', { name: 'Display' }).click();
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('checkbox', { name: 'Select all rows' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText(
    'Delete 2 forms and their submissions?',
  );
  await confirmDelete(page);
  await expect(page.getByText('No results found')).toBeVisible();
  await page.getByRole('button', { name: 'Display' }).click();
  await page.getByRole('button', { name: 'List', exact: true }).click();
});

test('a member without frontline permissions is refused the forms', async ({ newMember }) => {
  const { page } = await newMember(['team.view']);

  await page.goto(FORMS);
  await expect(page.getByText('You need the frontline.channel.view permission')).toBeVisible();
  await expectAccessible(page);
});
