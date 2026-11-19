// Surveys, with their steps' and options' old ids kept so votes still name them, and the report
// charts members saved.
import { SurveyStep } from '../../../api/src/db/surveys.ts';
import type { Context } from '../context.ts';
import { put, skip } from '../engine.ts';
import type { Step } from '../step.ts';
import {
  createdOf,
  entriesOf,
  filesOf,
  idOf,
  idsOf,
  intOf,
  plain,
  textOf,
  docId,
} from '../values.ts';
import { brandChannel } from './customers.ts';

const STATUSES = new Set(['pending', 'active', 'rejected', 'archived']);

/** An option's ticket rule, when it had one and its pipeline and status are imported. */
const ticketOf = (ctx: Context, option: Map<string, unknown>) => {
  const statusId = ctx.known('status', idOf(option.get('ticketStatusId')));
  const pipelineId = ctx.known('pipeline', idOf(option.get('ticketPipelineId')));
  const threshold = intOf(option.get('ticketThreshold') ?? option.get('threshold'));

  return option.get('ticketCreationEnabled') === true && statusId && pipelineId && threshold
    ? { threshold, pipelineId, statusId }
    : null;
};

/** Old steps, or the single `question` and `options` surveys had before steps, with `_id` as `id`. */
const stepsOf = (ctx: Context, doc: Record<string, unknown>) => {
  const steps: unknown[] = Array.isArray(doc.steps) && doc.steps.length > 0 ? doc.steps : [doc];

  return steps.map((value, index) => {
    const step = entriesOf(plain(value));
    const listed = step.get('options');
    const options: unknown[] = Array.isArray(listed) ? listed : [];

    // Old files sit at their old address, which the API's own uploads (core's storage) never do.
    const parsed = SurveyStep.safeParse({
      id: idOf(step.get('_id')) ?? `step-${index + 1}`,
      name: textOf(step.get('name')) ?? '',
      description: textOf(step.get('description')) ?? '',
      question: textOf(step.get('question')),
      allowMultiselect: step.get('allowMultiselect') === true,
      options: options
        .map((item) => entriesOf(item))
        .toSorted((a, b) => (intOf(a.get('order')) ?? 0) - (intOf(b.get('order')) ?? 0))
        .map((option) => ({
          id: idOf(option.get('_id')),
          text: textOf(option.get('text')),
          ticket: ticketOf(ctx, option),
        })),
    });

    return parsed.success
      ? { ...parsed.data, attachments: filesOf(step.get('attachments')).slice(0, 5) }
      : null;
  });
};

const surveyStep: Step = {
  source: 'erxes.frontline_surveys',
  documents: (ctx) => ctx.find(ctx.main, 'frontline_surveys'),
  transform: async (doc, ctx) => {
    const id = docId(doc);
    const title = textOf(doc.title);
    const code = textOf(doc.code);
    const status = String(doc.status ?? 'active');
    const steps = stepsOf(ctx, doc);
    const duration = intOf(doc.durationHours);

    if (!id || !title || !code) return skip('no title or code');

    if (!STATUSES.has(status)) return skip(`unknown status ${status}`);

    const parsed = steps.flatMap((step) => step ?? []);

    if (parsed.length !== steps.length) return skip('a question without two distinct options');

    return put([
      'frontline_surveys',
      {
        id,
        channel_id:
          ctx.known('channel', idOf(doc.channelId)) ?? (await brandChannel(ctx, idOf(doc.brandId))),
        title,
        code,
        status,
        rejection_reason: textOf(doc.rejectionReason),
        duration_hours: duration && duration >= 1 && duration <= 768 ? duration : null,
        steps: parsed,
        sent_count: Math.max(intOf(doc.sentCount) ?? 0, 0),
        created_by: ctx.user(idOf(doc.createdUserId)) ?? ctx.owner,
        created_at: createdOf(doc, doc.createdAt),
        updated_at: createdOf(doc, doc.updatedAt, doc.createdAt),
      },
    ]);
  },
};

/** An old saved chart's filters as core's condition group on the ticket list's paths. */
const ticketFilterOf = (ctx: Context, value: unknown) => {
  const filters = entriesOf(plain(value));
  const state = textOf(filters.get('state'));

  const rules = [
    ...(state ? [{ path: 'subject.state', op: 'in', value: [state] }] : []),
    ...[
      ['subject.channelId', 'channel', 'channelIds'],
      ['subject.pipelineId', 'pipeline', 'pipelineIds'],
      ['subject.tagIds', 'tag', 'tagIds'],
    ].flatMap(([path = '', kind = '', key = '']) => {
      const ids = ctx.knownAll(kind, idsOf(filters.get(key)));

      return ids.length > 0 ? [{ path, op: 'in', value: ids }] : [];
    }),
  ];

  return rules.length > 0 ? { match: 'all', rules } : null;
};

/** Old chart types and the new card each became. */
const CHARTS: Record<string, { section: string; kind: string; visual: string }> = {
  'ticket-list': { section: 'tickets', kind: 'ticket-list', visual: 'table' },
};

const chartStep: Step = {
  source: 'erxes.frontline_report_charts',
  documents: (ctx) => {
    ctx.report.note(
      'erxes.frontline_report_charts',
      "period: the last 30 days, as the old charts had none; widths stay each member's",
    );

    return ctx.find(ctx.main, 'frontline_report_charts');
  },
  transform: (doc, ctx) => {
    const id = docId(doc);
    const name = textOf(doc.name);
    const chart = CHARTS[String(doc.chartType)];

    if (!id || !name) return skip('no name');

    if (!chart) return skip(`unknown chart type ${String(doc.chartType)}`);

    return put([
      'frontline_report_charts',
      {
        id,
        name: name.slice(0, 200),
        ...chart,
        period: '30',
        filter: ticketFilterOf(ctx, doc.filters),
        created_by: ctx.user(idOf(doc.createdBy)) ?? ctx.owner,
        created_at: createdOf(doc, doc.createdAt),
        updated_at: createdOf(doc, doc.updatedAt, doc.createdAt),
      },
    ]);
  },
};

export const SURVEY_STEPS: Step[] = [surveyStep, chartStep];
