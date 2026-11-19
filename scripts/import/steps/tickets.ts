// Frontline's own pipelines, statuses, tickets and their comments to customers.
import type { Context } from '../context.ts';
import { put, type Put, skip } from '../engine.ts';
import type { Step } from '../step.ts';
import {
  boolOf,
  createdOf,
  dateOf,
  entriesOf,
  filesOf,
  idOf,
  idsOf,
  intOf,
  plain,
  textOf,
  textOfHtml,
  docId,
} from '../values.ts';
import { FALLBACK_CHANNEL } from './structure.ts';

const VISIBILITIES = new Set(['public', 'private']);

/** The pipeline and status for tickets whose stage or status old erxes deleted. */
export const ORPHAN_PIPELINE = 'officenext-tickets-without-stage';
export const ORPHAN_STATUS = 'officenext-tickets-without-stage-status';

/** Each pipeline's ticket numbers so far, so a repeated number stays on its first ticket only. */
const numbers = new Map<string, Set<string>>();

/** Queues a ticket number once per pipeline; a repeat becomes no number. */
const numberOnce = (pipelineId: string, number: string | null) => {
  if (!number) return null;

  const taken = numbers.get(pipelineId) ?? new Set<string>();

  numbers.set(pipelineId, taken);

  if (taken.has(number)) return null;

  taken.add(number);

  return number;
};

export const loadNumbers = async (ctx: Context) => {
  const { rows } = await ctx.client.query<{ pipeline_id: string; number: string }>(
    'SELECT pipeline_id, number FROM frontline_tickets WHERE number IS NOT NULL',
  );

  for (const { pipeline_id: pipelineId, number } of rows) numberOnce(pipelineId, number);
};

/** A pipeline row, remembered with its channel so its tickets take the same one. */
export const pipelineRow = (
  ctx: Context,
  id: string,
  channelId: string,
  row: Record<string, unknown>,
): Put => {
  ctx.remember('pipeline', id, id);
  ctx.remember('pipeline.channel', id, channelId);

  return ['frontline_pipelines', { id, channel_id: channelId, ...row }];
};

/** A status row, remembered with its pipeline so a ticket names both. */
export const statusRow = (
  ctx: Context,
  id: string,
  pipelineId: string,
  row: Record<string, unknown>,
): Put => {
  ctx.remember('status', id, id);
  ctx.remember('status.pipeline', id, pipelineId);

  return ['frontline_pipeline_statuses', { id, pipeline_id: pipelineId, ...row }];
};

const pipelineStep: Step = {
  source: 'erxes.frontline_tickets_pipelines',
  documents: (ctx) => ctx.find(ctx.main, 'frontline_tickets_pipelines'),
  transform: (doc, ctx) => {
    const id = docId(doc);
    const name = textOf(doc.name);

    if (!id || !name) return skip('no name');

    const visibility = String(doc.visibility ?? 'public');

    return put(
      pipelineRow(ctx, id, ctx.known('channel', idOf(doc.channelId)) ?? FALLBACK_CHANNEL, {
        name,
        description: textOf(doc.description),
        number_config: textOf(doc.numberConfig),
        number_size: intOf(doc.numberSize),
        name_config: textOf(doc.nameConfig),
        is_check_user: boolOf(doc.isCheckUser) ?? false,
        is_check_department: boolOf(doc.isCheckDepartment) ?? false,
        is_check_branch: boolOf(doc.isCheckBranch) ?? false,
        is_check_date: boolOf(doc.isCheckDate) ?? false,
        exclude_check_user_ids: ctx.users(idsOf(doc.excludeCheckUserIds)),
        visibility: VISIBILITIES.has(visibility) ? visibility : 'public',
        member_ids: ctx.users(idsOf(doc.memberIds)),
        created_by: ctx.user(idOf(doc.userId)) ?? ctx.owner,
        created_at: createdOf(doc, doc.createdAt),
        updated_at: createdOf(doc, doc.updatedAt, doc.createdAt),
      }),
    );
  },
};

const statusStep: Step = {
  source: 'erxes.frontline_tickets_pipeline_statuses',
  documents: (ctx) => ctx.find(ctx.main, 'frontline_tickets_pipeline_statuses'),
  transform: (doc, ctx) => {
    const id = docId(doc);
    const name = textOf(doc.name);
    const pipelineId = ctx.known('pipeline', idOf(doc.pipelineId));
    const type = intOf(doc.type);

    if (!id || !name) return skip('no name');

    if (!pipelineId) return skip('its pipeline is not imported');

    if (type === null || type < 1 || type > 6)
      return skip(`unknown status type ${String(doc.type)}`);

    const visibility = String(doc.visibilityType ?? 'public');

    return put(
      statusRow(ctx, id, pipelineId, {
        name,
        description: textOf(doc.description),
        color: textOf(doc.color) ?? undefined,
        type,
        order: intOf(doc.order) ?? 0,
        visibility_type: VISIBILITIES.has(visibility) ? visibility : 'public',
        member_ids: ctx.users(idsOf(doc.memberIds)),
        can_edit_member_ids: ctx.users(idsOf(doc.canEditMemberIds)),
        can_move_member_ids: ctx.users(idsOf(doc.canMoveMemberIds)),
        created_at: createdOf(doc, doc.createdAt),
        updated_at: createdOf(doc, doc.updatedAt, doc.createdAt),
      }),
    );
  },
};

/** A creator old erxes wrote as `cp:<customer id>`: a customer filed it, so no member made it. */
const memberOf = (ctx: Context, value: unknown) => {
  const id = idOf(value);

  return id && !id.startsWith('cp:') ? ctx.user(id) : null;
};

const orphanPipelineStep: Step = {
  source: 'import.tickets-without-stage',
  documents: () => [{ _id: ORPHAN_PIPELINE }],
  transform: (_doc, ctx) =>
    put(
      pipelineRow(ctx, ORPHAN_PIPELINE, FALLBACK_CHANNEL, {
        name: 'Old tickets without a stage',
        description:
          'Old erxes tickets whose stage, status or pipeline was deleted. Move them to their pipelines.',
        created_by: ctx.owner,
      }),
      statusRow(ctx, ORPHAN_STATUS, ORPHAN_PIPELINE, { name: 'Imported', type: 2, order: 0 }),
    ),
};

const ticketStep: Step = {
  source: 'erxes.frontline_tickets',
  documents: async (ctx) => {
    await loadNumbers(ctx);

    return ctx.find(ctx.main, 'frontline_tickets');
  },
  transform: (doc, ctx) => {
    const id = docId(doc);
    const statusId = ctx.known('status', idOf(doc.statusId)) ?? ORPHAN_STATUS;
    const pipelineId = ctx.known('status.pipeline', statusId) ?? ORPHAN_PIPELINE;
    const channelId = ctx.known('pipeline.channel', pipelineId) ?? FALLBACK_CHANNEL;
    const priority = intOf(doc.priority) ?? 0;

    if (!id) return skip('no id');

    if (priority < 0 || priority > 4) return skip(`unknown priority ${String(doc.priority)}`);

    ctx.remember('ticket', id, id);

    const customerId = ctx.customer(idOf(doc.customerId));
    const sla = entriesOf(plain(doc.sla));

    return put([
      'frontline_tickets',
      {
        id,
        channel_id: channelId,
        pipeline_id: pipelineId,
        status_id: statusId,
        number: numberOnce(pipelineId, textOf(doc.number)),
        name: textOf(doc.name) ?? 'Untitled ticket',
        description: textOfHtml(doc.description) ?? '',
        priority,
        assignee_id: ctx.user(idOf(doc.assigneeId)),
        start_date: dateOf(doc.startDate),
        target_date: dateOf(doc.targetDate),
        state: doc.state === 'archived' ? 'archived' : 'active',
        attachments: filesOf(doc.attachments),
        status_changed_at: createdOf(doc, doc.statusChangedDate, doc.updatedAt, doc.createdAt),
        status_changed_by: memberOf(ctx, doc.statusChangedBy),
        first_response_due_at: dateOf(sla.get('firstResponseDueAt')),
        resolution_due_at: dateOf(sla.get('resolutionDueAt')),
        first_responded_at: dateOf(sla.get('firstRespondedAt')),
        resolved_at: dateOf(sla.get('resolvedAt')),
        created_by: memberOf(ctx, doc.createdBy ?? doc.userId),
        assigned_member_ids: ctx.users(idsOf(doc.assignedMembers)),
        subscribed_user_ids: ctx.users(idsOf(doc.subscribedUserIds)),
        tag_ids: ctx.knownAll('tag', idsOf(doc.tagIds)),
        properties_data: plain(doc.propertiesData) ?? {},
        branch_id: ctx.known('team', idOf(doc.branchId)) ?? null,
        department_id: ctx.known('team', idOf(doc.departmentId)) ?? null,
        customer_id: customerId,
        company_id: ctx.company(idOf(doc.companyId) ?? idsOf(doc.companyIds)[0] ?? null),
        created_at: createdOf(doc, doc.createdAt),
        updated_at: createdOf(doc, doc.updatedAt, doc.createdAt),
      },
    ]);
  },
};

/**
 * A ticket's notes: the team's notes to the customer are its comments. The customer's own replies
 * (`cp:` authors) and internal notes have no place on a new ticket and are listed.
 */
const noteStep: Step = {
  source: 'erxes.frontline_tickets_notes',
  documents: (ctx) => ctx.find(ctx.main, 'frontline_tickets_notes'),
  transform: (doc, ctx) => {
    const id = docId(doc);
    const ticketId = ctx.known('ticket', idOf(doc.contentId));
    const author = idOf(doc.createdBy);
    const body = textOfHtml(doc.content);

    if (!id || !ticketId) return skip('its ticket is not imported');

    if (doc.isInternal === true)
      return skip("an internal note: core's Activity tab holds the team's notes");

    if (!author || author.startsWith('cp:'))
      return skip("the customer's reply: a new ticket takes no customer comments");

    if (!body) return skip('no text');

    return put([
      'frontline_ticket_comments',
      {
        id,
        ticket_id: ticketId,
        body,
        created_by: ctx.user(author),
        created_at: createdOf(doc, doc.createdAt),
      },
    ]);
  },
};

export const TICKET_STEPS: Step[] = [
  pipelineStep,
  statusStep,
  orphanPipelineStep,
  ticketStep,
  noteStep,
];
