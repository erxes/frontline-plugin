import { describe, expect, it } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { clientAs } from '#/test/member.ts';

const agent = [PERMISSIONS.channelView];

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
