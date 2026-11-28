import {
  expect,
  expectAccessible,
  Id,
  messengerIn,
  openMessenger,
  pluginApi,
  test,
  unique,
} from './fixtures.ts';

// The widget's ticket form draws core's Data Extensions fields on `frontline.ticket`: required
// ones, and ones a `visibleWhen` rule shows.

test("the widget's ticket form asks for a required field, and shows one only while its rule holds", async ({
  page,
  api,
  request,
  plugin,
}) => {
  const rpc = await pluginApi(api, request);
  const { id: channelId } = await rpc('channels/create', { name: `Support ${unique()}` }, Id);
  const pipeline = { channelId, name: `Returns ${unique()}` };
  const { id: pipelineId } = await rpc('pipelines/create', pipeline, Id);
  const [plan, seats, subject] = [`Plan ${unique()}`, `Seats ${unique()}`, `Team ${unique()}`];

  // A group of this pipeline's alone, so no other spec's ticket asks for its required field.
  const group = await api.dataFieldGroups.create({
    recordType: 'frontline.ticket',
    label: plan,
    code: `plan${unique()}`,
    appliesTo: { pipeline: [pipelineId] },
  });

  const field = { recordType: 'frontline.ticket', groupId: group.id } as const;
  const planKey = `plan${unique()}`;

  await api.dataFields.create({
    ...field,
    key: planKey,
    label: plan,
    type: 'select',
    options: [
      { value: 'solo', label: 'Solo' },
      { value: 'team', label: 'Team' },
    ],
    settings: { required: true },
  });

  await api.dataFields.create({
    ...field,
    key: `seats${unique()}`,
    label: seats,
    type: 'number',
    settings: { visibleWhen: { field: planKey, operator: 'eq', value: 'team' } },
  });

  const key = await messengerIn(rpc, { ticketPipelineIds: [pipelineId] }, channelId);
  await using site = await openMessenger(page.context(), plugin, key);
  const { shop, panel } = site;

  await panel.getByRole('button', { name: /^Tickets/ }).click();
  await panel.getByRole('button', { name: 'File a ticket' }).click();
  await panel.getByRole('textbox', { name: 'Email or phone' }).fill(`${unique()}@example.com`);
  await panel.getByRole('button', { name: 'Continue' }).click();
  await panel.getByRole('textbox', { name: 'Subject' }).fill(subject);
  await expect(panel.getByRole('spinbutton', { name: seats })).toBeHidden();
  await panel.getByRole('button', { name: 'Send ticket' }).click();
  await expect(panel.getByRole('alert')).toHaveText('This field is required');
  await expect(panel.getByRole('combobox', { name: plan })).toHaveAccessibleDescription(
    'This field is required',
  );
  // The refused form, its empty required field marked.
  await expectAccessible(shop, panel.getByRole('alert'));

  await panel.getByRole('combobox', { name: plan }).selectOption({ label: 'Team' });
  await expect(panel.getByRole('alert')).toBeHidden();
  await panel.getByRole('spinbutton', { name: seats }).fill('3');
  await panel.getByRole('button', { name: 'Send ticket' }).click();
  await expect(panel.getByRole('list', { name: 'Your tickets' })).toContainText(subject);
});
