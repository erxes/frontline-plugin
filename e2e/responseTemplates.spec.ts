import {
  confirmDelete,
  expect,
  expectPage,
  recordPath,
  recordPanel,
  test,
  unique,
} from './fixtures.ts';
import { channelSections } from './channelSettings.ts';

const CHANNELS = '/frontline/settings/channels';

test("a channel admin writes, edits and deletes the channel's response templates", async ({
  page,
  newMember,
}) => {
  const channel = `Support ${unique()}`;
  const teammate = await newMember(['frontline.channel.view']);
  const panel = recordPanel(page);

  await page.goto(recordPath(CHANNELS, 'frontline:channel'));
  await panel.getByLabel('Name').fill(channel);
  await panel.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByPlaceholder('Members', { exact: true }).fill(teammate.fullName);
  await page.getByRole('option', { name: teammate.fullName }).click();
  await panel.getByLabel('Name').click();
  await panel.getByRole('button', { name: 'Create channel' }).click();
  await channelSections(page).getByRole('link', { name: 'Templates' }).click();
  await page.getByRole('link', { name: 'Manage channel response templates' }).click();

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

  // The content is written in the reply box's card: Save, or Ctrl+Enter as a reply sends.
  const save = panel.getByRole('button', { name: 'Save', exact: true });

  await expect(save).toBeDisabled();
  await panel.getByRole('textbox', { name: 'Content' }).press('End');
  await page.keyboard.type(' We reply within a day.');
  await expect(save).toBeEnabled();
  await page.keyboard.press('Control+Enter');
  await expect(save).toBeDisabled();
  await expect(page.getByRole('row', { name: /We reply within a day/ })).toBeVisible();

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
  await expect(recordPanel(teammate.page).getByRole('button', { name: 'Save' })).toBeHidden();

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

  await page.goto(`${CHANNELS}/any/templates/all`);
  await expect(page.getByText('You need the frontline.channel.view permission')).toBeVisible();
});
