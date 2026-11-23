import { expect, expectPage, recordPath, recordPanel, test, unique } from './fixtures.ts';
import { cardOf, channelSections } from './channelSettings.ts';

const CHANNELS = '/frontline/settings/channels';

/** A page inside a channel, as its address reads. */
const CHANNEL_PAGE = (page: string) => new RegExp(`/frontline/channels/[^/]+/${page}$`);

/** A section of a channel's settings, in Frontline's settings, as its address reads. */
const CHANNEL_SETTINGS = (section: string) =>
  new RegExp(`/frontline/settings/channels/[^/]+/${section}$`);

test('the owner creates a channel with a teammate, who sees its settings read-only', async ({
  page,
  newMember,
}) => {
  const name = `Support ${unique()}`;
  const teammate = await newMember(['frontline.channel.view']);
  const panel = recordPanel(page);

  await page.goto(CHANNELS);
  await page.getByRole('button', { name: 'Create channel' }).click();

  await panel.getByLabel('Name').fill(name);
  await panel.getByPlaceholder('Search members').fill(teammate.fullName);
  await panel.getByRole('option', { name: teammate.fullName }).click();

  await panel.getByRole('button', { name: 'Create channel' }).click();

  // The new channel opens on its settings' integrations, beside the settings sidebar: it starts
  // with a website messenger and a Support pipeline. Its sections are its settings: no activity or
  // notes.
  await expect(page).toHaveURL(CHANNEL_SETTINGS('integrations'));
  await expect(page.getByRole('link', { name: 'Exit settings' })).toBeVisible();
  await expect(page.getByRole('link', { name: `Settings of ${name}` })).toBeVisible();
  await channelSections(page).getByRole('link', { name: 'Pipelines' }).click();
  await expect(page.getByRole('button', { name: 'Support', exact: true })).toBeVisible();
  await channelSections(page).getByRole('link', { name: 'Members' }).click();
  await expect(page.getByText(teammate.fullName)).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Role: Admin' })).toBeVisible();

  // The list counts what it holds: one messenger, no unread conversations, forms or templates.
  await page.goto(CHANNELS);
  const row = page.getByRole('row', { name: new RegExp(name) });

  await expect(row).toBeVisible();
  await expect(row.getByRole('link', { name: '1', exact: true })).toHaveCount(1);
  await expect(row.getByRole('link', { name: '0', exact: true })).toHaveCount(3);

  // A second channel with the same name is refused, and the form keeps what was typed.
  await page.goto(recordPath(CHANNELS, 'frontline:channel'));
  await panel.getByLabel('Name').fill(name);
  await panel.getByRole('button', { name: 'Create channel' }).click();
  await expect(panel.getByText(`Another channel is already called ${name}.`)).toBeVisible();
  await expect(panel.getByLabel('Name')).toHaveValue(name);

  // A kind's card opens it inside the channel; its accounts connect in core's Integrations.
  await page.goto(CHANNELS);
  await page.getByRole('link', { name, exact: true }).click();
  await channelSections(page).getByRole('link', { name: 'Integrations' }).click();
  await cardOf(page, 'Telegram').getByRole('link').click();
  await page.getByRole('link', { name: 'Connect in Integrations' }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(panel.getByLabel('Bot token')).toBeVisible();

  const theirs = teammate.page;

  await theirs.goto(CHANNELS);
  await expect(theirs.getByRole('button', { name: 'Create channel' })).toBeHidden();
  await theirs.getByRole('link', { name, exact: true }).click();
  await expect(theirs.getByLabel('Name')).toBeDisabled();
  await expect(theirs.getByRole('button', { name: 'Delete channel' })).toBeHidden();
  await channelSections(theirs).getByRole('link', { name: 'Integrations' }).click();
  await channelSections(theirs)
    .getByRole('link', { name: /^Telegram/ })
    .click();
  await expect(theirs.getByRole('link', { name: 'Connect in Integrations' })).toBeHidden();

  await channelSections(theirs).getByRole('link', { name: 'Members' }).click();
  await expect(theirs.getByRole('button', { name: 'Add members' })).toBeHidden();
  await theirs.getByRole('link', { name: 'Manage channel members' }).click();
  // Without core's team.view the teammate can't read names, but sees both members and their roles.
  await expect(theirs.getByRole('row')).toHaveCount(3);
  await expect(theirs.getByRole('cell', { name: 'Member', exact: true })).toBeVisible();
  await expect(theirs.getByRole('button', { name: 'Add members' })).toBeHidden();
});

test('each member opens their own personal inbox, left out of the channel list', async ({
  page,
  newMember,
}) => {
  const teammate = await newMember(['frontline.channel.view']);

  await page.goto('/frontline/personal-channel');
  await expect(page).toHaveURL(CHANNEL_PAGE('inbox'));
  await expectPage(page, 'Inbox');
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(
    'Personal inbox',
  );
  const mine = page.url();

  await page.goto('/frontline/personal-channel');
  await expect(page).toHaveURL(mine);
  await page.goto(CHANNELS);
  await expect(page.getByRole('link', { name: 'Personal inbox', exact: true })).toBeHidden();

  await teammate.page.goto('/frontline/personal-channel');
  await expect(teammate.page).toHaveURL(CHANNEL_PAGE('inbox'));
  expect(teammate.page.url()).not.toBe(mine);
});

test('the owner renames a channel, adds a member, removes them, and cannot remove the last admin', async ({
  page,
  newMember,
}) => {
  const name = `Billing ${unique()}`;
  const renamed = `${name} desk`;
  const teammate = await newMember(['frontline.channel.view']);
  const panel = recordPanel(page);

  await page.goto(recordPath(CHANNELS, 'frontline:channel'));
  await panel.getByLabel('Name').fill(name);
  await panel.getByRole('button', { name: 'Create channel' }).click();

  // Its settings rename it; the breadcrumb and the channel list follow.
  await channelSections(page)
    .getByRole('link', { name: new RegExp(`^${name}`) })
    .click();
  await page.getByLabel('Name').fill(renamed);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(renamed);
  await page.goto(CHANNELS);
  await expect(page.getByRole('row', { name: new RegExp(renamed) })).toBeVisible();

  await page.getByRole('link', { name: renamed, exact: true }).click();
  await channelSections(page).getByRole('link', { name: 'Members' }).click();
  await page.getByRole('link', { name: 'Manage channel members' }).click();
  await page.getByRole('button', { name: 'Add members' }).click();
  const popover = page.getByRole('dialog');

  await popover.getByPlaceholder('Search members').fill(teammate.fullName);
  await popover.getByRole('option', { name: teammate.fullName }).click();
  await popover.getByRole('button', { name: 'Add members' }).click();
  const row = page.getByRole('row', { name: new RegExp(teammate.fullName) });

  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Member actions' }).click();
  await page.getByRole('option', { name: 'Remove' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
  await expect(row).toBeHidden();

  // The owner is the only admin left, so the API refuses to remove them.
  await page.getByRole('button', { name: 'Member actions' }).click();
  await page.getByRole('option', { name: 'Remove' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Could not save the change')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Role: Admin' })).toBeVisible();
});

test('a member without frontline permissions is refused', async ({ newMember }) => {
  const { page } = await newMember(['team.view']);

  await page.goto('/frontline/settings/channels');
  await expect(page.getByText('You need the frontline.channel.view permission')).toBeVisible();
});
