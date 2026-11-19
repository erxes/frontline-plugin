import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { z } from 'zod';
import {
  confirmDelete,
  expect,
  expectAccessible,
  filterBy,
  Id,
  moveByKeys,
  openChannelPipelines,
  openShop,
  pluginApi,
  recordPanel,
  recordPath,
  test,
  unique,
} from './fixtures.ts';

const FORMS = '/frontline/forms';

/** What the public address gives a visitor: the fields, by id. */
const Shown = z.object({ fields: z.array(z.object({ id: z.string(), label: z.string() })) });

/** Sends `answers` to a form's public address `url`, as its widget does, and gives the status. */
const answer = async (request: APIRequestContext, url: string, answers: Record<string, unknown>) =>
  (await request.post(url, { data: { answers } })).status();

/** Opens `select` and picks `option` in it. */
const pick = async (page: Page, select: Locator, option: string) => {
  await select.click();
  await page.getByRole('option', { name: option, exact: true }).click();
  // A click while the menu still closes would only dismiss it.
  await expect(page.getByRole('option', { name: option, exact: true })).toBeHidden();
};

/** Opens the in-place text `name`, types `value` and saves it with Enter. */
const retype = async (page: Page, button: Locator, placeholder: string, value: string) => {
  await button.click();
  await page.getByPlaceholder(placeholder, { exact: true }).fill(value);
  await page.keyboard.press('Enter');
};

/** Creates the form `name` in `channel` from New form, then shows it in the panel. */
const newForm = async (page: Page, channel: string, name: string) => {
  const panel = recordPanel(page);

  await page.goto(FORMS);
  await page.getByRole('button', { name: 'New form' }).first().click();
  await pick(page, panel.getByRole('combobox', { name: 'Channel' }), channel);
  await panel.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await panel.getByRole('button', { name: 'Create form' }).click();
  await expect(panel.getByRole('button', { name: `Name ${name}`, exact: true })).toBeVisible();
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
  // Visitors type to find a plan instead of opening a list.
  await page.getByRole('switch', { name: 'Visitors type to find one' }).click();
  await expect(page.getByRole('switch', { name: 'Visitors type to find one' })).toBeChecked();
  await page.getByRole('button', { name: 'Settings of Plan' }).click();
  await addField(page, 'Number', 'Seats');
  await page.getByRole('button', { name: 'Settings of Seats' }).click();
  await pick(page, page.getByRole('combobox', { name: 'Width' }), 'Half width');
  await pick(page, page.getByRole('combobox', { name: 'Shows' }), 'Only when every rule holds');
  await page.getByRole('button', { name: 'Add rule' }).click();
  // A rule on a dropdown compares a picked option, so it offers is and is not, and Plan's options.
  await page.getByRole('combobox', { name: 'Comparison' }).click();
  await expect(page.getByRole('option', { name: 'is not', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'contains', exact: true })).toBeHidden();
  await page.getByRole('option', { name: 'is', exact: true }).click();
  await pick(page, page.getByRole('combobox', { name: 'Value' }), 'Team');

  const preview = page.getByRole('region', { name: 'Preview' });

  await expect(preview.getByText('Book a demo')).toBeVisible();
  await expect(preview.getByLabel('Seats')).toBeHidden();
  await pick(page, preview.getByRole('combobox', { name: 'Plan' }), 'Team');
  await expect(preview.getByLabel('Seats')).toBeVisible();
};

/**
 * Sends the form twice: from a shop with the install code the panel gives, where Seats shows
 * once Team is picked, and from its public address, which drops a hidden field's answer.
 */
const sendAsVisitor = async (page: Page, request: APIRequestContext, name: string) => {
  const panel = recordPanel(page);

  await page.goto(FORMS);
  await page.getByRole('button', { name, exact: true }).click();
  await panel.getByRole('button', { name: 'Show install code' }).click();

  const installCode = (await panel.getByLabel('Install code').textContent()) ?? '';
  const url = (await panel.getByText(/\/api\/public\//).textContent()) ?? '';

  {
    await using site = await openShop(page.context(), installCode);
    const form = site.shop.getByRole('form', { name: 'Book a demo' });

    await expect(form.getByLabel('Seats')).toBeHidden();
    // Plan searches its options: text that is none is refused, and one but for case becomes it.
    await form.getByLabel('Plan').fill('Tea');
    await form.getByRole('button', { name: 'Ask' }).click();
    await expect(form.getByText('Pick one of the options')).toBeVisible();
    await form.getByLabel('Plan').fill('team');
    await expect(form.getByLabel('Plan')).toHaveValue('Team');
    await form.getByLabel('Seats').fill('5');

    await form.getByRole('button', { name: 'Ask' }).click();
    await expect(site.shop.getByRole('heading', { name: 'Thank you' })).toBeVisible();
  }

  const shown = await request.get(url);
  const { fields } = Shown.parse(await shown.json());
  const idOf = (label: string) => fields.find((field) => field.label === label)?.id ?? '';

  expect(shown.status()).toBe(200);
  expect(await answer(request, url, { [idOf('Plan')]: 'Free', [idOf('Seats')]: 9 })).toBe(201);
  expect(await answer(request, url, { [idOf('Plan')]: 'Gold' })).toBe(422);
};

test('an admin builds a form and a visitor sends it from a website and its address', async ({
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
  await panel.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await panel.getByLabel('Form title').fill('Book a demo');

  await panel.getByRole('button', { name: 'Create form' }).click();
  await expect(panel.getByRole('button', { name: `Name ${name}`, exact: true })).toBeVisible();
  await retype(page, panel.getByRole('button', { name: /^Button text/ }), 'Button text', 'Ask');
  await expect(panel.getByRole('button', { name: 'Button text Ask' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Active' }).getByRole('button', { name, exact: true }),
  ).toBeVisible();

  await panel.getByRole('tab', { name: 'Activity' }).click();
  await expect(panel.getByText(`Created ${name}`)).toBeVisible();
  await panel.getByRole('tab', { name: 'Detail' }).click();

  // The builder edits fields in place; its preview applies their show rules as it is filled in.
  await panel.getByRole('link', { name: /^Fields/ }).click();
  await expect(page).toHaveURL(/\/builder$/);
  await buildFields(page);

  // A visitor reads the form from its public address and sends it.
  await sendAsVisitor(page, request, name);
  // The shop's and the address's answers both count; Gold was refused.
  await page.reload();
  await expect(panel.getByRole('link', { name: /^Submissions/ })).toContainText('2');
});

test('an admin narrows, corrects and deletes the answers a form got', async ({
  page,
  api,
  request,
}) => {
  const rpc = await pluginApi(api, request);
  const panel = recordPanel(page);
  const channel = await rpc('channels/create', { name: `Support ${unique()}` }, Id);
  const form = await rpc('forms/create', { channelId: channel.id, name: unique() }, Id);
  // Where the form takes submissions.
  const { url } = await rpc('forms/embed', { id: form.id }, z.object({ url: z.string() }));

  const plan = await rpc(
    'forms/fields/add',
    { formId: form.id, type: 'select', label: 'Plan', options: ['Free', 'Team'] },
    Id,
  );

  // Seats shows only for the Team plan.
  const logics = [{ fieldId: plan.id, operator: 'is', value: 'Team' }];

  const seats = await rpc(
    'forms/fields/add',
    { formId: form.id, type: 'number', label: 'Seats', logicAction: 'show', logics },
    Id,
  );

  expect(await answer(request, url, { [plan.id]: 'Team', [seats.id]: 5 })).toBe(201);
  expect(await answer(request, url, { [plan.id]: 'Free', [seats.id]: 9 })).toBe(201);

  // The form's panel links to its submissions: a column per field, and a filter per field.
  await page.goto(recordPath(FORMS, 'frontline:form', form.id));
  await panel.getByRole('link', { name: /^Submissions/ }).click();
  await expect(page).toHaveURL(/\/submissions$/);

  const team = page.getByRole('row', { name: /Team/ });
  const free = page.getByRole('row', { name: /Free/ });

  // The Free plan hides Seats, so its 9 seats were dropped.
  await expect(team.getByRole('cell', { name: '5', exact: true })).toBeVisible();
  await expect(free.getByRole('cell', { name: '9', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('option', { name: 'Plan', exact: true }).click();
  await page.getByRole('textbox', { name: 'Value' }).fill('team');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/subject\.answer\./);
  await expect(free).toBeHidden();

  await page.getByRole('button', { name: 'Remove Plan filter' }).click();
  await expect(free).toBeVisible();

  // A submission opens in the panel, where an answer is corrected and the submission deleted.
  await team.getByRole('button', { name: 'Submission actions' }).click();
  await page.getByRole('option', { name: 'Open' }).click();
  await expect(page.getByRole('option', { name: 'Open' })).toBeHidden();
  await retype(page, panel.getByRole('button', { name: 'Seats 5' }), 'Seats', '7');
  await expect(panel.getByRole('button', { name: 'Seats 7' })).toBeVisible();
  await expect(team.getByRole('cell', { name: '7', exact: true })).toBeVisible();
  await expectAccessible(page, panel.getByRole('button', { name: 'Seats 7' }));
  await panel.getByRole('button', { name: 'Submission actions' }).click();
  await page.getByRole('option', { name: 'Delete' }).click();
  await confirmDelete(page);
  await expect(team).toBeHidden();
});

test('the builder previews a phone and the thank-you screen, and drags fields by keyboard', async ({
  page,
  api,
  request,
}) => {
  const rpc = await pluginApi(api, request);
  const channel = await rpc('channels/create', { name: `Support ${unique()}` }, Id);
  const form = await rpc('forms/create', { channelId: channel.id, name: unique() }, Id);

  await rpc('forms/fields/add', { formId: form.id, type: 'text', label: 'Company' }, Id);
  await rpc('forms/fields/add', { formId: form.id, type: 'number', label: 'Seats' }, Id);
  await page.goto(`${FORMS}/${form.id}/builder`);

  const preview = page.getByRole('region', { name: 'Preview' });
  const mobile = page.getByRole('button', { name: 'Mobile', exact: true });

  // The preview narrows to a phone's width and keeps what was typed.
  await preview.getByLabel('Seats').fill('5');
  await mobile.click();
  await expect(mobile).toHaveAttribute('aria-pressed', 'true');
  await expect(preview.getByLabel('Seats')).toHaveValue('5');

  // It shows what a visitor reads after sending, and the form again with its answers.
  const screens = page.getByRole('group', { name: 'Screen' });

  await screens.getByRole('button', { name: 'Thank you' }).click();
  await expect(preview.getByRole('heading', { name: 'Thank you' })).toBeVisible();
  await screens.getByRole('button', { name: 'Form' }).click();
  await expect(preview.getByLabel('Seats')).toHaveValue('5');

  // The keyboard drags Seats, its settings open, above Company and back (#174).
  const first = page.getByRole('button', { name: /^Settings of/ }).first();
  const seats = page.getByRole('button', { name: 'Move Seats', exact: true });

  await page.getByRole('button', { name: 'Settings of Seats' }).click();
  await moveByKeys(seats, 'ArrowUp', 'Seats', 'Company');
  await expect(first).toHaveAccessibleName('Settings of Seats');
  await moveByKeys(seats, 'ArrowDown', 'Seats', 'Company');
  await expect(first).toHaveAccessibleName('Settings of Company');
});

test('a channel member reads a form and its submissions but changes neither', async ({
  page,
  newMember,
}) => {
  const teammate = await newMember(['frontline.channel.view']);
  const channel = await openChannelPipelines(page, teammate.fullName);
  const name = `Contact us ${unique()}`;

  await newForm(page, channel, name);
  await teammate.page.goto(FORMS);
  await teammate.page.getByRole('button', { name: `Actions for ${name}` }).click();
  await expect(teammate.page.getByRole('option', { name: 'Submissions' })).toBeVisible();
  await expect(teammate.page.getByRole('option', { name: 'Delete' })).toBeHidden();
  await teammate.page.keyboard.press('Escape');
  await teammate.page.getByRole('button', { name, exact: true }).click();
  const theirs = recordPanel(teammate.page);

  await expect(theirs.getByRole('button', { name: `Name ${name}`, exact: true })).toBeDisabled();
  await expect(theirs.getByRole('combobox', { name: 'Channel' })).toHaveText(channel);
});

test('an admin drafts, duplicates, archives and deletes forms', async ({ page }) => {
  const channel = await openChannelPipelines(page);
  const name = `Feedback ${unique()}`;
  const panel = recordPanel(page);
  const nameBox = panel.getByRole('textbox', { name: 'Name', exact: true });

  // What was typed in New form stays when the member leaves; Cancel asks, then throws it away.
  await page.goto(FORMS);
  await page.getByRole('button', { name: 'New form' }).first().click();
  await nameBox.fill('Half a form');
  await page.goto(FORMS);
  await page.getByRole('button', { name: 'New form' }).first().click();
  await expect(nameBox).toHaveValue('Half a form');
  await panel.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Discard' }).click();
  await page.getByRole('button', { name: 'New form' }).first().click();
  await expect(nameBox).toHaveValue('');
  await newForm(page, channel, name);
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

test('an admin tags a form and narrows the forms by its tag', async ({ page }) => {
  const channel = await openChannelPipelines(page);
  const name = `Webinar ${unique()}`;
  const tag = `Events ${unique()}`;

  await page.goto('/frontline/settings/tags');
  await page.getByRole('button', { name: 'Add tag' }).click();
  const sheet = page.getByRole('dialog');

  await sheet.getByLabel('Name', { exact: true }).fill(tag);
  await pick(page, sheet.getByRole('combobox', { name: 'For' }), 'Forms');
  await sheet.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('row', { name: new RegExp(`${tag}.*Forms`) })).toBeVisible();

  await newForm(page, channel, name);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Display' }).click();
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.keyboard.press('Escape');
  const row = page.getByRole('row', { name: new RegExp(name) });

  await row.getByText('No tags').click();
  await page.getByRole('option', { name: tag, exact: true }).click();
  await page.keyboard.press('Escape');
  // The table display, with a tag on a row.
  await expectAccessible(page, row.getByText(tag));

  await filterBy(page, 'Tags', tag);
  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Display' }).click();
  await page.getByRole('button', { name: 'List', exact: true }).click();
});

test('a member without frontline permissions is refused the forms', async ({ newMember }) => {
  const { page } = await newMember(['team.view']);

  await page.goto(FORMS);
  await expect(page.getByText('You need the frontline.channel.view permission')).toBeVisible();
});
