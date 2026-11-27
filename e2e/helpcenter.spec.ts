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
  plugin,
  request,
}) => {
  const rpc = await pluginApi(api, request);
  const answers = `Answers ${unique()}`;
  const title = `Acme ${unique()}`;
  const kbTopicId = await knowledgeBase(rpc, answers);

  // Visitors read a topic through a 30 s cache, so every article is in before the first read.
  const { id: categoryId } = await rpc(
    'knowledgebase/categories/create',
    { topicId: kbTopicId, title: 'Shipping' },
    Id,
  );

  await Promise.all(
    Array.from({ length: 31 }, (_, at) =>
      rpc(
        'knowledgebase/articles/create',
        { title: `Shipping note ${at}`, content: '<p>Note</p>', categoryId, status: 'publish' },
        Id,
      ),
    ),
  );
  await rpc('helpCenters/create', { title, kbTopicId }, Id);

  // The help center's page gives the script line; the website shows a launcher with its topic.
  await page.goto(HELP_CENTERS);
  await page.getByRole('link', { name: title, exact: true }).click();
  await page.getByRole('link', { name: 'Site and install' }).click();

  const installCode = (await page.getByLabel('Knowledge base install code').textContent()) ?? '';

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

  await using site = await openMessenger(page.context(), plugin, key);
  const search = site.panel.getByRole('searchbox', { name: 'Search articles' });

  await site.panel.getByRole('button', { name: /^Help articles/ }).click();
  await search.fill('money');
  await site.panel.getByRole('button', { name: /^Refunds/ }).click();
  await expect(site.panel.getByText(ARTICLE)).toBeVisible();

  // The visitor reacts once; their pick counts, and pressing it again takes it off.
  await site.panel.getByRole('button', { name: 'Like 0' }).click();
  await expect(site.panel.getByRole('button', { name: 'Like 1' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await site.panel.getByRole('button', { name: 'Like 1' }).click();
  await expect(site.panel.getByRole('button', { name: 'Like 0' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  await site.panel.getByRole('button', { name: 'Back' }).click();
  await expect(search).toHaveValue('money');

  // A category lists its articles 30 to a page, and Next turns to the rest.
  await search.fill('');
  await site.panel.getByRole('button', { name: 'Shipping 31 articles' }).click();
  await expect(site.panel.getByRole('button', { name: /^Shipping note/ })).toHaveCount(30);
  await site.panel.getByRole('button', { name: 'Next' }).click();
  await expect(site.panel.getByText('Page 2 of 2')).toBeVisible();
  await expect(site.panel.getByRole('button', { name: /^Shipping note/ })).toHaveCount(1);
  await expect(site.panel.getByRole('button', { name: 'Next' })).toBeDisabled();
});

test('the owner creates a help center, edits it on its page, sees its domain and deletes it', async ({
  page,
  plugin,
}) => {
  const title = `Help ${unique()}`;
  const renamed = `${title} desk`;
  const panel = recordPanel(page);
  const sections = page.getByRole('navigation', { name: 'Help center settings' });

  // The old address leads to the list, which the sidebar opens beside the knowledge base.
  await page.goto('/frontline/helpcenter');
  await expect(page).toHaveURL(new RegExp(`${HELP_CENTERS}$`));
  await expect(
    page.getByRole('list', { name: 'Tools' }).getByRole('link', { name: 'Help centers' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add help center' }).first().click();
  await panel.getByLabel('Title').fill(title);
  await panel.getByRole('button', { name: 'Create help center' }).click();

  // It opens on its own page, its settings in one form saved once.
  await expect(page).toHaveURL(new RegExp(`${HELP_CENTERS}/[^/]+$`));
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue(title);
  await page.getByRole('textbox', { name: 'Title' }).fill(renamed);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Help center saved')).toBeVisible();
  await expect(sections.getByText(renamed)).toBeVisible();

  // Its install code is a section of its own.
  await sections.getByRole('link', { name: 'Site and install' }).click();
  await expect(page.getByLabel('Knowledge base install code')).toBeVisible();

  // The e2e stack has no Cloudflare settings, so the domain section says so.
  await sections.getByRole('link', { name: 'Domain' }).click();
  await expect(
    page.getByText('Custom domains are not available on this installation.'),
  ).toBeVisible();

  await sections.getByRole('link', { name: 'General' }).click();
  await page.getByRole('button', { name: 'Delete help center' }).click();
  await confirmDelete(page);
  await expect(page).toHaveURL(new RegExp(`${HELP_CENTERS}$`));
  await expect(page.getByRole('row', { name: new RegExp(renamed) })).toBeHidden();

  // A site address with no help center gets a page that says so.
  const missing = await page.goto(new URL('/help/deadbeef', plugin).href);

  expect(missing?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'No such help center' })).toBeVisible();
});

test('the owner picks its forms, changes its look and deletes help centers together', async ({
  page,
  api,
  request,
}) => {
  const rpc = await pluginApi(api, request);
  const title = `Portal ${unique()}`;
  const other = `Desk ${unique()}`;
  const form = `Quote ${unique()}`;
  const channel = await rpc('channels/create', { name: `Leads ${unique()}` }, Id);

  await rpc('forms/create', { channelId: channel.id, name: form }, Id);
  await rpc('helpCenters/create', { title }, Id);
  await rpc('helpCenters/create', { title: other }, Id);

  // The old settings address leads to the list; a title opens the help center's page.
  await page.goto('/frontline/settings/help-centers');
  await expect(page).toHaveURL(new RegExp(`${HELP_CENTERS}/?$`));
  await page.getByRole('link', { name: title, exact: true }).click();

  await page.getByRole('button', { name: 'Forms', exact: true }).click();
  await page.getByPlaceholder('Forms', { exact: true }).fill(form);
  await page.getByRole('option', { name: form, exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Help center saved')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Forms', exact: true })).toContainText(form);

  // The look is a section of its own, saved once.
  await page
    .getByRole('navigation', { name: 'Help center settings' })
    .getByRole('link', { name: 'Appearance' })
    .click();
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
  await expect(page).toHaveURL(new RegExp(`${HELP_CENTERS}/[^/?]+$`));
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue(title);

  // A reader opens its page and changes nothing: no Save, no Delete.
  await reader.page.goto(HELP_CENTERS);
  await expect(reader.page.getByRole('button', { name: 'Add help center' })).toBeHidden();
  await reader.page.getByRole('link', { name: title, exact: true }).click();
  await expect(reader.page.getByRole('textbox', { name: 'Title' })).toBeDisabled();
  await expect(reader.page.getByRole('button', { name: 'Save', exact: true })).toBeHidden();
  await expect(reader.page.getByRole('button', { name: 'Delete help center' })).toBeHidden();

  await stranger.page.goto(HELP_CENTERS);
  await expect(
    stranger.page.getByText('You need the frontline.help_center.view permission'),
  ).toBeVisible();
});
