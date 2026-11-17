import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import type * as CoreModule from '#/core.ts';
import { PERMISSIONS } from '#/core.ts';
import { serve } from '#/test/http.ts';
import { clientAs } from '#/test/member.ts';

// Tests never reach core: each messenger visitor becomes a new stand-in customer.
const core = vi.hoisted(() => ({ customers: 0 }));

vi.mock('#/core.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof CoreModule>();

  return {
    ...actual,
    core: {
      ...actual.core,
      forOrg: () => ({
        customers: {
          create: async () => {
            core.customers += 1;

            return { id: `customer-${core.customers}` };
          },
        },
        notifications: { create: async () => ({ ok: true }) },
      }),
    },
  };
});

const messenger = serve('/api/public/messenger');

const agent = [PERMISSIONS.channelView];

const Connected = z.looseObject({ token: z.string() });

/** A new messenger visitor's token. */
const visitorOf = async (key: string) =>
  Connected.parse((await messenger.post('/connect', { key })).body).token;

/** What the visitor reads of a sent survey. */
const Shown = z.object({
  open: z.boolean(),
  optionIds: z.array(z.string()),
  steps: z.array(z.object({ options: z.array(z.looseObject({})) })),
});

const question = (text: string, options: string[]) => ({
  name: text,
  question: text,
  options: options.map((option) => ({ text: option })),
});

describe('surveys', () => {
  it('creates a survey with ids on its questions, edits it and keeps it from other orgs', async () => {
    const owner = clientAs('org-sv-a');
    const channel = await owner.channels.create({ name: 'Support' });

    const survey = await owner.surveys.create({
      channelId: channel.id,
      title: 'After the call',
      steps: [question('How did we do?', ['Great', 'Fine', 'Poor'])],
    });

    expect(survey).toMatchObject({
      status: 'active',
      sentCount: 0,
      voteCount: 0,
      canManage: true,
      steps: [{ question: 'How did we do?', allowMultiselect: false }],
    });
    expect(survey.steps[0]?.options.map((option) => option.ticket)).toEqual([null, null, null]);
    expect(new Set(survey.steps[0]?.options.map((option) => option.id)).size).toBe(3);

    const [step] = survey.steps;

    if (!step) throw new Error('no step');

    // Kept ids keep their votes; a repeated id gets a new one.
    const edited = await owner.surveys.update({
      id: survey.id,
      durationHours: 24,
      steps: [{ ...step, options: [...step.options, { id: step.id, text: 'Awful' }] }],
    });

    expect(edited.durationHours).toBe(24);
    expect(edited.steps[0]?.options.slice(0, 3)).toEqual(step.options);
    expect(edited.steps[0]?.options[3]?.id).not.toBe(step.id);

    await expect(
      owner.surveys.update({
        id: survey.id,
        steps: [question('Twice?', ['Yes', 'yes'])],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    await expect(owner.surveys.list({ search: 'how did' })).resolves.toMatchObject({
      surveys: [{ id: survey.id }],
      totalCount: 1,
    });
    await expect(owner.surveys.results({ id: survey.id })).resolves.toEqual({
      voterCount: 0,
      options: {},
    });

    const stranger = clientAs('org-sv-b');

    await expect(stranger.surveys.list({})).resolves.toMatchObject({ totalCount: 0 });
    await expect(stranger.surveys.get({ id: survey.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    await owner.surveys.remove({ ids: [survey.id] });

    await expect(owner.surveys.get({ id: survey.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it("refuses a ticket rule outside the survey's channel", async () => {
    const owner = clientAs('org-sv-c');
    const support = await owner.channels.create({ name: 'Support' });
    const billing = await owner.channels.create({ name: 'Billing' });
    const pipeline = await owner.pipelines.create({ channelId: billing.id, name: 'Refunds' });
    const [status] = await owner.pipelines.statuses.list({ pipelineId: pipeline.id });

    if (!status) throw new Error('no status');

    const steps = [
      {
        name: 'Rate',
        question: 'Rate us',
        options: [
          { text: 'Good' },
          { text: 'Bad', ticket: { threshold: 3, pipelineId: pipeline.id, statusId: status.id } },
        ],
      },
    ];

    await expect(
      owner.surveys.create({ channelId: support.id, title: 'Rate', steps }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      owner.surveys.create({ channelId: billing.id, title: 'Rate', steps }),
    ).resolves.toMatchObject({ channelId: billing.id });
  });

  it('sends a survey to a messenger visitor, takes their vote and opens its ticket', async () => {
    const owner = clientAs('org-sv-send');
    const channel = await owner.channels.create({ name: 'Support', memberIds: ['teammate'] });
    const teammate = clientAs('org-sv-send', [PERMISSIONS.inboxView, ...agent], 'teammate');

    const { publicKey } = await owner.integrations.create({
      channelId: channel.id,
      kind: 'messenger',
      name: 'Website',
      config: {},
    });

    const token = await visitorOf(publicKey ?? '');

    const { conversationId } = z
      .object({ conversationId: z.string() })
      .parse((await messenger.post('/messages', { content: 'Hi' }, token)).body);

    const pipeline = await owner.pipelines.create({ channelId: channel.id, name: 'Complaints' });
    const [status] = await owner.pipelines.statuses.list({ pipelineId: pipeline.id });

    if (!status) throw new Error('no status');

    const ticket = { threshold: 1, pipelineId: pipeline.id, statusId: status.id };

    const survey = await owner.surveys.create({
      channelId: channel.id,
      title: 'How did we do?',
      steps: [
        {
          name: 'Rate',
          question: 'Rate our answer',
          options: [{ text: 'Good' }, { text: 'Bad', ticket }],
        },
      ],
    });

    const [good, bad] = survey.steps[0]?.options ?? [];
    const billing = await owner.channels.create({ name: 'Billing' });

    const elsewhere = await owner.surveys.create({
      channelId: billing.id,
      title: 'Elsewhere',
      steps: [question('Yes or no?', ['Yes', 'No'])],
    });

    // The teammate reads the inbox but may not send surveys, so the composer offers none.
    await expect(teammate.surveys.sendable({ conversationId })).resolves.toEqual([]);
    await expect(owner.surveys.sendable({ conversationId })).resolves.toEqual([
      { id: survey.id, title: 'How did we do?' },
    ]);
    await expect(owner.surveys.send({ id: elsewhere.id, conversationId })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });

    const sent = await owner.surveys.send({ id: survey.id, conversationId });

    expect(sent).toMatchObject({ content: 'Rate our answer', surveyId: survey.id });

    const shown = Shown.parse((await messenger.get(`/surveys/${sent.id}`, token)).body);

    expect(shown).toMatchObject({ open: true, optionIds: [] });
    // The visitor sees the options, never their ticket rules.
    expect(shown.steps[0]?.options[1]).toEqual({ id: bad?.id, text: 'Bad' });

    const vote = async (optionIds: (string | undefined)[]) =>
      (await messenger.post(`/surveys/${sent.id}/votes`, { optionIds }, token)).status;

    expect(await vote(['nope'])).toBe(400);
    expect(await vote([good?.id, bad?.id])).toBe(400);
    expect(await vote([bad?.id])).toBe(204);
    // A second vote replaces the first and opens no second ticket.
    expect(await vote([bad?.id])).toBe(204);

    expect(Shown.parse((await messenger.get(`/surveys/${sent.id}`, token)).body)).toMatchObject({
      optionIds: [bad?.id],
    });
    await expect(owner.surveys.get({ id: survey.id })).resolves.toMatchObject({
      sentCount: 1,
      voteCount: 1,
    });
    await expect(owner.tickets.list({ search: 'How did we do' })).resolves.toMatchObject({
      tickets: [{ name: 'How did we do?: Bad', pipelineId: pipeline.id, statusId: status.id }],
    });

    // Another visitor can't read this one's survey.
    const stranger = await visitorOf(publicKey ?? '');

    expect((await messenger.get(`/surveys/${sent.id}`, stranger)).status).toBe(404);
  });

  it('archives a survey and makes it active again, refusing moves it has no way to', async () => {
    const owner = clientAs('org-sv-d');
    const channel = await owner.channels.create({ name: 'Support' });

    const survey = await owner.surveys.create({
      channelId: channel.id,
      title: 'Poll',
      steps: [question('Yes or no?', ['Yes', 'No'])],
    });

    await expect(
      owner.surveys.setStatus({ ids: [survey.id], status: 'rejected', reason: 'Spam' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      owner.surveys.setStatus({ ids: [survey.id], status: 'archived' }),
    ).resolves.toEqual({
      ids: [survey.id],
    });
    await expect(owner.surveys.setStatus({ ids: [survey.id], status: 'active' })).resolves.toEqual({
      ids: [survey.id],
    });

    await owner.channels.addMembers({ id: channel.id, userIds: ['agent'] });

    const asAgent = clientAs('org-sv-d', agent, 'agent');

    await expect(asAgent.surveys.get({ id: survey.id })).resolves.toMatchObject({
      canManage: false,
    });
    await expect(
      asAgent.surveys.setStatus({ ids: [survey.id], status: 'archived' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
