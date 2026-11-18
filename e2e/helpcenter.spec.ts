import {
  confirmDelete,
  expect,
  Id,
  messengerIn,
  openMessenger,
  openShop,
  pluginApi,
  recordPanel,
  test,
  unique,
} from './fixtures.ts';

const HELP_CENTERS = '/frontline/settings/help-centers';

test('a visitor reads the knowledge base from its script on a website and in the messenger', async ({
  page,
  api,
  request,
}) => {
  const rpc = await pluginApi(api, request);
  const answers = `Answers ${unique()}`;
  const title = `Acme ${unique()}`;
  const topic = await rpc('knowledgebase/topics/create', { title: answers }, Id);

  const category = await rpc(
    'knowledgebase/categories/create',
    { topicId: topic.id, title: 'Billing' },
    Id,
  );

  await rpc(
    'knowledgebase/articles/create',
    {
      categoryId: category.id,
      title: 'Refunds',
      summary: 'Money back within 30 days',
      content: '<p>Write to us within 30 days.</p>',
      status: 'publish',
    },
    Id,
  );
  await rpc('helpCenters/create', { title, kbTopicId: topic.id }, Id);

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
    await expect(panel.getByText('Write to us within 30 days.')).toBeVisible();
  }

  // A messenger that offers the topic has a Help articles tab, searched in place.
  const key = await messengerIn(rpc, { knowledgeBaseTopicId: topic.id });

  await using site = await openMessenger(page.context(), key);
  const search = site.panel.getByRole('searchbox', { name: 'Search articles' });

  await site.panel.getByRole('button', { name: /^Help articles/ }).click();
  await search.fill('money');
  await site.panel.getByRole('button', { name: /^Refunds/ }).click();
  await expect(site.panel.getByText('Write to us within 30 days.')).toBeVisible();

  await site.panel.getByRole('button', { name: 'Back' }).click();
  await expect(search).toHaveValue('money');
});

test('the owner creates a help center, edits it, sees its domain tab and deletes it', async ({
  page,
}) => {
  const title = `Help ${unique()}`;
  const renamed = `${title} desk`;
  const panel = recordPanel(page);

  // The old address leads to the list.
  await page.goto('/frontline/helpcenter');
  await expect(page).toHaveURL(new RegExp(`${HELP_CENTERS}$`));
  await page.getByRole('button', { name: 'Add help center' }).click();
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

test('a reader sees help centers read-only, and a member without the permission is refused', async ({
  page,
  newMember,
}) => {
  const title = `Docs ${unique()}`;
  const reader = await newMember(['frontline.help_center.view']);
  const stranger = await newMember(['frontline.channel.view']);
  const panel = recordPanel(page);

  await page.goto(HELP_CENTERS);
  await page.getByRole('button', { name: 'Add help center' }).click();
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
