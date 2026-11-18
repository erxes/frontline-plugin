import {
  confirmDelete,
  expect,
  expectPage,
  newRecordPath,
  recordPanel,
  test,
  unique,
} from './fixtures.ts';

const CHANNELS = '/frontline/settings/channels';

test("a channel admin writes, edits and deletes the channel's response templates", async ({
  page,
  newMember,
}) => {
  const channel = `Support ${unique()}`;
  const teammate = await newMember(['frontline.channel.view']);
  const panel = recordPanel(page);

  await page.goto(newRecordPath(CHANNELS, 'frontline:channel'));
  await panel.getByLabel('Name').fill(channel);
  await panel.getByPlaceholder('Search members').fill(teammate.fullName);
  await panel.getByRole('option', { name: teammate.fullName }).click();
  await panel.getByRole('button', { name: 'Create channel' }).click();
  await panel.getByRole('link', { name: /Manage channel response templates/ }).click();

  await expectPage(page, 'Response templates');
  await expect(page.getByText('No responses yet')).toBeVisible();
  await page.getByRole('button', { name: 'Create response template' }).first().click();

  // The draft starts in the page's channel.
  await expect(panel.getByRole('combobox', { name: 'Channel' })).toHaveText(channel);
  await panel.getByLabel('Name').fill('Greeting');
  await panel.getByRole('textbox', { name: 'Content' }).fill('Hello, thanks for writing to us.');

  await panel.getByRole('button', { name: 'Create response template' }).click();

  // The saved template takes the draft's place in the panel.
  await expect(panel.getByText('Hello, thanks for writing to us.')).toBeVisible();
  await expect(page.getByRole('row', { name: /Greeting/ })).toBeVisible();
  await expect(page.getByText('1 record')).toBeVisible();

  // The name is edited in place.
  await panel.getByRole('button', { name: 'Name Greeting', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Welcome');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('row', { name: /Welcome/ })).toBeVisible();

  // The filter bar's search lives in the address and matches the content's words.
  const list = new URL(page.url());

  list.search = new URLSearchParams({ searchValue: 'thanks for writing' }).toString();
  await page.goto(list.toString());
  await expect(page.getByRole('row', { name: /Welcome/ })).toBeVisible();
  list.search = new URLSearchParams({ searchValue: 'paragraph' }).toString();
  await page.goto(list.toString());
  await expect(page.getByText('No results found')).toBeVisible();
  list.search = '';
  await page.goto(list.toString());

  // A member of the channel reads its templates and can't change them.
  await teammate.page.goto(list.toString());
  await expect(teammate.page.getByRole('button', { name: 'Welcome', exact: true })).toBeVisible();
  await expect(
    teammate.page.getByRole('button', { name: 'Create response template' }),
  ).toBeHidden();
  await expect(teammate.page.getByRole('button', { name: 'Actions for Welcome' })).toBeHidden();
  await teammate.page.getByRole('button', { name: 'Welcome', exact: true }).click();
  await expect(
    recordPanel(teammate.page).getByRole('button', { name: 'Name Welcome', exact: true }),
  ).toBeDisabled();
  await expect(
    recordPanel(teammate.page).getByRole('button', { name: 'Response template actions' }),
  ).toBeHidden();

  await page
    .getByRole('row', { name: /Welcome/ })
    .getByRole('checkbox')
    .check();
  await page.getByRole('button', { name: 'Delete' }).click();
  await confirmDelete(page);
  await expect(page.getByText('No responses yet')).toBeVisible();
});

test('a member without frontline permissions is refused the templates', async ({ newMember }) => {
  const { page } = await newMember(['team.view']);

  await page.goto(`${CHANNELS}/any/response`);
  await expect(page.getByText('You need the frontline.channel.view permission')).toBeVisible();
});
