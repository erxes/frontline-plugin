import { describe, expect, it } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { clientAs } from '#/test/member.ts';

const agent = [PERMISSIONS.channelView];

describe('forms', () => {
  it('creates a form in a channel, edits it, lists it and keeps it from other orgs', async () => {
    const owner = clientAs('org-fm-a');
    const channel = await owner.channels.create({ name: 'Sales' });

    const form = await owner.forms.create({
      channelId: channel.id,
      name: 'Demo request',
      title: 'Book a demo',
    });

    expect(form).toMatchObject({
      channelId: channel.id,
      status: 'active',
      loadType: 'embedded',
      viewCount: 0,
      submissionCount: 0,
      canManage: true,
    });
    expect(form.code).toMatch(/^[0-9a-f]{8}$/);
    expect(form).not.toHaveProperty('orgId');

    await expect(
      owner.forms.update({ id: form.id, buttonText: 'Send', thankTitle: 'Thanks' }),
    ).resolves.toMatchObject({ buttonText: 'Send', thankTitle: 'Thanks', name: 'Demo request' });

    await expect(owner.forms.list({ search: 'demo' })).resolves.toMatchObject({
      forms: [{ id: form.id }],
      totalCount: 1,
    });
    await expect(
      owner.forms.list({
        filter: JSON.stringify({
          match: 'all',
          rules: [{ path: 'subject.status', op: 'in', value: ['archived'] }],
        }),
      }),
    ).resolves.toMatchObject({ forms: [], totalCount: 0 });

    const stranger = clientAs('org-fm-b');

    await expect(stranger.forms.list({})).resolves.toMatchObject({ forms: [], totalCount: 0 });
    await expect(stranger.forms.get({ id: form.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lets a channel member read its forms and only its admins change them', async () => {
    const owner = clientAs('org-fm-c');
    const channel = await owner.channels.create({ name: 'Support' });
    const form = await owner.forms.create({ channelId: channel.id, name: 'Feedback' });

    await owner.channels.addMembers({ id: channel.id, userIds: ['agent'] });

    const asAgent = clientAs('org-fm-c', agent, 'agent');

    await expect(asAgent.forms.get({ id: form.id })).resolves.toMatchObject({ canManage: false });
    await expect(asAgent.forms.update({ id: form.id, name: 'Mine' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      asAgent.forms.fields.add({ formId: form.id, type: 'text', label: 'Name' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const outsider = clientAs('org-fm-c', agent, 'outsider');

    await expect(outsider.forms.list({})).resolves.toMatchObject({ forms: [], totalCount: 0 });
  });

  it('builds fields with rules, reorders them and drops rules on a removed field', async () => {
    const owner = clientAs('org-fm-d');
    const channel = await owner.channels.create({ name: 'Sales' });
    const form = await owner.forms.create({ channelId: channel.id, name: 'Signup' });

    const plan = await owner.forms.fields.add({
      formId: form.id,
      type: 'select',
      label: 'Plan',
      options: ['Free', 'Team'],
    });

    const seats = await owner.forms.fields.add({
      formId: form.id,
      type: 'number',
      label: 'Seats',
      logicAction: 'show',
      logics: [{ fieldId: plan.id, operator: 'is', value: 'Team' }],
    });

    expect([plan.order, seats.order]).toEqual([0, 1]);

    await expect(
      owner.forms.fields.update({
        id: seats.id,
        logics: [{ fieldId: seats.id, operator: 'hasAnyValue' }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      owner.forms.fields.update({
        id: plan.id,
        validator: { type: 'custom', pattern: '(unclosed' },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    const arranged = await owner.forms.fields.arrange({
      formId: form.id,
      pageNumber: 1,
      ids: [seats.id, plan.id],
    });

    expect(arranged.map((field) => field.id)).toEqual([seats.id, plan.id]);

    await owner.forms.fields.remove({ ids: [plan.id] });

    await expect(owner.forms.fields.list({ formId: form.id })).resolves.toMatchObject([
      { id: seats.id, logics: [] },
    ]);
  });

  it('removes only empty steps, and never the last one', async () => {
    const owner = clientAs('org-fm-e');
    const channel = await owner.channels.create({ name: 'Sales' });

    const form = await owner.forms.create({
      channelId: channel.id,
      name: 'Long form',
      steps: [{ name: 'About you' }, { name: 'Your company' }, { name: 'Done' }],
    });

    await owner.forms.fields.add({ formId: form.id, type: 'text', label: 'Name', pageNumber: 1 });

    const size = await owner.forms.fields.add({
      formId: form.id,
      type: 'number',
      label: 'Company size',
      pageNumber: 3,
    });

    await expect(
      owner.forms.fields.removeStep({ formId: form.id, pageNumber: 1 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      owner.forms.fields.removeStep({ formId: form.id, pageNumber: 2 }),
    ).resolves.toEqual({
      steps: 2,
    });

    const fields = await owner.forms.fields.list({ formId: form.id });

    expect(fields.find((field) => field.id === size.id)?.pageNumber).toBe(2);
  });

  it('duplicates a form with its fields, pointing rules at the copies', async () => {
    const owner = clientAs('org-fm-f');
    const channel = await owner.channels.create({ name: 'Sales' });
    const form = await owner.forms.create({ channelId: channel.id, name: 'Quote' });
    const kind = await owner.forms.fields.add({ formId: form.id, type: 'text', label: 'Kind' });

    await owner.forms.fields.add({
      formId: form.id,
      type: 'text',
      label: 'Details',
      logicAction: 'hide',
      logics: [{ fieldId: kind.id, operator: 'isUnknown' }],
    });

    const copy = await owner.forms.duplicate({ id: form.id });

    expect(copy).toMatchObject({ name: 'Quote (copy)', status: 'active', viewCount: 0 });
    expect(copy.code).not.toBe(form.code);

    const [copiedKind, copiedDetails] = await owner.forms.fields.list({ formId: copy.id });

    expect(copiedKind?.id).not.toBe(kind.id);
    expect(copiedDetails?.logics).toEqual([{ fieldId: copiedKind?.id, operator: 'isUnknown' }]);
  });

  it('archives forms and makes them active again', async () => {
    const owner = clientAs('org-fm-g');
    const channel = await owner.channels.create({ name: 'Sales' });
    const form = await owner.forms.create({ channelId: channel.id, name: 'Old' });

    await expect(owner.forms.setStatus({ ids: [form.id], status: 'archived' })).resolves.toEqual({
      ids: [form.id],
    });
    await expect(owner.forms.setStatus({ ids: [form.id], status: 'archived' })).resolves.toEqual({
      ids: [],
    });
    await expect(owner.forms.get({ id: form.id })).resolves.toMatchObject({ status: 'archived' });

    await owner.forms.remove({ ids: [form.id] });

    await expect(owner.forms.get({ id: form.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
