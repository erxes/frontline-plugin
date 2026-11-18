import {
  ARTICLE,
  confirmDelete,
  expect,
  Id,
  knowledgeBase,
  messengerIn,
  openMessenger,
  openShop,
  pluginApi,
  recordPanel,
  test,
  unique,
} from './fixtures.ts';

const HELP_CENTERS = '/frontline/help-centers';

test('a visitor reads the knowledge base from its script on a website and in the messenger', async ({
  page,
  api,
  request,
}) => {
  const rpc = await pluginApi(api, request);
  const answers = `Answers ${unique()}`;
  const title = `Acme ${unique()}`;
  const kbTopicId = await knowledgeBase(rpc, answers);

  await rpc('helpCenters/create', { title, kbTopicId }, Id);

  // The help center's panel gives the script line; the website shows a launcher with its topic.
  await page.goto(HELP_CENTERS);
  await page.getByRole('button', { name: title, exact: true }).click();

  const installCode =
    (await recordPanel(page).getByLabel('Knowledge base install code').textContent()) ?? '';

  {
    await using site = await openShop(page.context(), installCode);
    const panel = site.shop.getByRole('dialog', { name: answers });

    await site.shop.getByRole('button', { name: `Open ${answers}` }).click();
    await panel.getByRole('button', { name: /^Billing/ }).click();
    await panel.getByRole('button', { name: /^Refunds/ }).click();
    await expect(panel.getByText(ARTICLE)).toBeVisible();
  }

  // A messenger that offers the topic has a Help articles tab, searched in place.
  const key = await messengerIn(rpc, { knowledgeBaseTopicId: kbTopicId });

  await using site = await openMessenger(page.context(), key);
  const search = site.panel.getByRole('searchbox', { name: 'Search articles' });

  await site.panel.getByRole('button', { name: /^Help articles/ }).click();
  await search.fill('money');
  await site.panel.getByRole('button', { name: /^Refunds/ }).click();
  await expect(site.panel.getByText(ARTICLE)).toBeVisible();

  await site.panel.getByRole('button', { name: 'Back' }).click();
  await expect(search).toHaveValue('money');
});

test('the owner creates a help center, edits it, sees its domain tab and deletes it', async ({
  page,
}) => {
  const title = `Help ${unique()}`;
  const renamed = `${title} desk`;
  const panel = recordPanel(page);

  // The old address leads to the list, which the sidebar opens beside the knowledge base.
  await page.goto('/frontline/helpcenter');
  await expect(page).toHaveURL(new RegExp(`${HELP_CENTERS}$`));
  await expect(page.getByRole('link', { name: 'Help centers' })).toBeVisible();
  await page.getByRole('button', { name: 'Add help center' }).first().click();
  await panel.getByLabel('Title').fill(title);

  await panel.getByRole('button', { name: 'Create help center' }).click();

  // It opens edited in place, with the public key its site is found by.
  await expect(panel.getByText('Public key')).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(title) })).toBeVisible();
  await panel.getByRole('button', { name: title }).first().click();
  await page.getByPlaceholder('Title').fill(renamed);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('row', { name: new RegExp(renamed) })).toBeVisible();
  await expect(panel.getByText('Look')).toBeVisible();

  // The e2e stack has no Cloudflare settings, so the domain tab says so.
  await panel.getByRole('tab', { name: 'Domain' }).click();
  await expect(
    panel.getByText('Custom domains are not available on this installation.'),
  ).toBeVisible();

  await panel.getByRole('button', { name: 'Help center actions' }).click();
  await page.getByRole('option', { name: 'Delete' }).click();
  await confirmDelete(page);
  await expect(page.getByRole('row', { name: new RegExp(renamed) })).toBeHidden();
});

test('the owner picks its forms, changes its look and deletes help centers together', async ({
  page,
  api,
  request,
}) => {
  const rpc = await pluginApi(api, request);
  const panel = recordPanel(page);
  const title = `Portal ${unique()}`;
  const other = `Desk ${unique()}`;
  const form = `Quote ${unique()}`;
  const channel = await rpc('channels/create', { name: `Leads ${unique()}` }, Id);

  await rpc('forms/create', { channelId: channel.id, name: form }, Id);
  await rpc('helpCenters/create', { title }, Id);
  await rpc('helpCenters/create', { title: other }, Id);

  // The old settings address leads to the list.
  await page.goto('/frontline/settings/help-centers');
  await expect(page).toHaveURL(new RegExp(`${HELP_CENTERS}/?$`));
  await page.getByRole('button', { name: title, exact: true }).click();

  await panel.getByText('No forms').click();
  await page.getByPlaceholder('Forms', { exact: true }).fill(form);
  await page.getByRole('option', { name: form, exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(panel.getByText(form)).toBeVisible();

  // The look is a page of its own, saved once.
  await panel.getByRole('link', { name: 'Edit appearance' }).click();
  await expect(page).toHaveURL(/\/appearance$/);
  await page.getByRole('textbox', { name: 'Wordmark' }).fill('Acme');
  await page.getByRole('button', { name: 'Add column' }).click();
  await page.getByRole('textbox', { name: 'Column heading' }).fill('Support');
  await page.getByRole('textbox', { name: 'Link label' }).fill('Status');
  await page.getByRole('textbox', { name: 'Link address' }).fill('https://status.acme.test');
  await page.getByRole('combobox', { name: 'Base font' }).click();
  await page.getByRole('option', { name: 'Inter' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Help center saved')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Wordmark' })).toHaveValue('Acme');
  await expect(page.getByRole('textbox', { name: 'Link address' })).toHaveValue(
    'https://status.acme.test',
  );
  await expect(page.getByRole('combobox', { name: 'Base font' })).toHaveText('Inter');

  // Picked rows go in one request from the bar under the table.
  await page.getByRole('link', { name: 'Help centers' }).first().click();

  for (const name of [title, other])
    await page
      .getByRole('row', { name: new RegExp(name) })
      .getByRole('checkbox')
      .check();

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Delete 2 help centers?');
  await confirmDelete(page);
  await expect(page.getByRole('row', { name: new RegExp(`${title}|${other}`) })).toHaveCount(0);
});

test('a reader sees help centers read-only, and a member without the permission is refused', async ({
  page,
  newMember,
}) => {
  const title = `Docs ${unique()}`;
  const reader = await newMember(['frontline.help_center.view']);
  const stranger = await newMember(['frontline.channel.view']);
  const panel = recordPanel(page);

  await page.goto(HELP_CENTERS);
  await page.getByRole('button', { name: 'Add help center' }).first().click();
  await panel.getByLabel('Title').fill(title);
  await panel.getByRole('button', { name: 'Create help center' }).click();
  await expect(page.getByRole('row', { name: new RegExp(title) })).toBeVisible();

  const theirPanel = recordPanel(reader.page);

  await reader.page.goto(HELP_CENTERS);
  await expect(reader.page.getByRole('button', { name: 'Add help center' })).toBeHidden();
  await reader.page.getByRole('button', { name: title, exact: true }).click();
  await expect(theirPanel.getByRole('button', { name: title }).first()).toBeDisabled();
  await expect(theirPanel.getByRole('button', { name: 'Help center actions' })).toBeHidden();

  await stranger.page.goto(HELP_CENTERS);
  await expect(
    stranger.page.getByText('You need the frontline.help_center.view permission'),
  ).toBeVisible();
});
