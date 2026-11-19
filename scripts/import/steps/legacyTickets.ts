// The old 1.x tickets: boards, pipelines and stages of type `ticket` (in `tickets_*` and in the
// shared `boards`, `pipelines` and `stages`), and their tickets, labels, checklists, comments and
// links to customers and companies. Old ticket pipelines had no channel, so they land in the
// import's channel; a ticket whose stage old erxes deleted lands in one pipeline kept for those.
import type { Db, Document } from 'mongodb';
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
  textOf,
  textOfHtml,
  docId,
} from '../values.ts';
import { already, FALLBACK_CHANNEL } from './structure.ts';
import { loadNumbers, pipelineRow, statusRow } from './tickets.ts';

/** The pipeline and status for tickets whose stage old erxes deleted. */
const ORPHAN_PIPELINE = 'officenext-tickets-without-stage';
const ORPHAN_STATUS = 'officenext-tickets-without-stage-status';

/** Old stage positions as status types: the first new, the last resolved, the rest in progress. */
export const statusTypeAt = (index: number, count: number) => {
  if (index === 0) return 1;

  return index === count - 1 ? 4 : 3;
};

/** `Critical`, `High`, `Medium`/`Normal`, `Low` as the new priorities. */
const PRIORITIES: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Normal: 2, Low: 1 };

type Legacy = {
  boards: Map<string, string>;
  pipelines: Document[];
  stages: Document[];
  labels: Map<string, Document>;
  checklists: Map<string, string[]>;
  people: Map<string, { customers: string[]; companies: string[] }>;
};

const legacies = new Map<string, Legacy>();

const DATABASES = ['erxes', 'erxes_office'] as const;

type Database = (typeof DATABASES)[number];

const dbOf = (ctx: Context, database: Database): Db =>
  database === 'erxes' ? ctx.main : ctx.office;

/** Old checklists of tickets, as text the ticket's description ends with. */
const loadChecklists = async (db: Db) => {
  const checklists = await db
    .collection('checklists')
    .find({ contentType: { $in: ['ticket', 'cards:ticket'] } })
    .toArray();

  const extra = (await db.listCollections({ name: 'tickets_checklists' }).toArray()).length
    ? await db
        .collection('tickets_checklists')
        .find({ contentType: { $in: ['ticket', 'cards:ticket'] } })
        .toArray()
    : [];

  const byTicket = new Map<string, string[]>();
  const seen = new Set<string>();

  for (const checklist of [...checklists, ...extra]) {
    const checklistId = docId(checklist);
    const ticketId = idOf(checklist.contentTypeId);

    if (!checklistId || !ticketId || seen.has(checklistId)) continue;

    seen.add(checklistId);

    const items = new Map<string, Document>();

    for (const collection of [
      'checklist_items',
      'tickets_checklist_items',
      'ticket_checklist_items',
    ])
      for await (const item of db.collection(collection).find({ checklistId: checklistId }))
        items.set(String(docId(item)), item);

    const lines = [...items.values()]
      .toSorted((a, b) => (intOf(a.order) ?? 0) - (intOf(b.order) ?? 0))
      .map((item) => `- [${item.isChecked === true ? 'x' : ' '}] ${textOf(item.content) ?? ''}`);

    byTicket.set(ticketId, [
      ...(byTicket.get(ticketId) ?? []),
      `${textOf(checklist.title) ?? 'Checklist'}\n${lines.join('\n')}`,
    ]);
  }

  return byTicket;
};

/** Customers and companies each old ticket was linked to through `conformities`. */
const loadPeople = async (db: Db) => {
  const people = new Map<string, { customers: string[]; companies: string[] }>();

  for await (const link of db
    .collection('conformities')
    .find({ $or: [{ mainType: 'ticket' }, { relType: 'ticket' }] })) {
    const ticketFirst = link.mainType === 'ticket';
    const ticketId = idOf(ticketFirst ? link.mainTypeId : link.relTypeId);
    const otherType = String(ticketFirst ? link.relType : link.mainType);
    const otherId = idOf(ticketFirst ? link.relTypeId : link.mainTypeId);

    if (!ticketId || !otherId) continue;

    const entry = people.get(ticketId) ?? { customers: [], companies: [] };

    if (otherType === 'customer') entry.customers.push(otherId);

    if (otherType === 'company') entry.companies.push(otherId);

    people.set(ticketId, entry);
  }

  return people;
};

const load = async (ctx: Context, database: Database) => {
  const found = legacies.get(database);

  if (found) return found;

  const db = dbOf(ctx, database);
  const exists = async (name: string) => (await db.listCollections({ name }).toArray()).length > 0;

  const shared = async (name: string, filter: Document) =>
    (await exists(name)) ? db.collection(name).find(filter).toArray() : [];

  const ticketStages = await db.collection('tickets').distinct('stageId');

  const stages = [
    ...(await shared('tickets_stages', {})),
    ...(await shared('stages', { $or: [{ type: 'ticket' }, { _id: { $in: ticketStages } }] })),
  ];

  const pipelineIds = stages.map((stage): unknown => stage.pipelineId);

  const pipelines = [
    ...(await shared('tickets_pipelines', {})),
    ...(await shared('pipelines', { $or: [{ type: 'ticket' }, { _id: { $in: pipelineIds } }] })),
  ];

  const boards = new Map(
    [...(await shared('tickets_boards', {})), ...(await shared('boards', { type: 'ticket' }))].map(
      (board) => [String(docId(board)), textOf(board.name) ?? ''] as const,
    ),
  );

  const labels = new Map(
    [
      ...(await shared('tickets_pipeline_labels', {})),
      ...(await shared('pipeline_labels', {})),
    ].map((label) => [String(docId(label)), label] as const),
  );

  const legacy: Legacy = {
    boards,
    pipelines: [
      ...new Map(pipelines.map((pipeline) => [String(docId(pipeline)), pipeline])).values(),
    ],
    stages: [...new Map(stages.map((stage) => [String(docId(stage)), stage])).values()],
    labels,
    checklists: await loadChecklists(db),
    people: await loadPeople(db),
  };

  legacies.set(database, legacy);

  return legacy;
};

const legacyPipelineStep = (database: Database): Step => ({
  source: `${database}.ticket pipelines (tickets_pipelines, pipelines)`,
  documents: async (ctx) => (await load(ctx, database)).pipelines,
  transform: (doc, ctx) => {
    const id = docId(doc);
    const name = textOf(doc.name);
    const board = legacies.get(database)?.boards.get(String(idOf(doc.boardId)));

    if (!id || !name) return skip('no name');

    if (ctx.known('pipeline', id)) return skip('already in erxes by id');

    return put(
      pipelineRow(ctx, id, FALLBACK_CHANNEL, {
        name,
        description: board ? `Board: ${board}` : null,
        number_config: textOf(doc.numberConfig),
        number_size: intOf(doc.numberSize),
        name_config: textOf(doc.nameConfig),
        is_check_user: boolOf(doc.isCheckUser) ?? false,
        is_check_department: boolOf(doc.isCheckDepartment) ?? false,
        is_check_branch: boolOf(doc.isCheckBranch) ?? false,
        is_check_date: boolOf(doc.isCheckDate) ?? false,
        exclude_check_user_ids: ctx.users(idsOf(doc.excludeCheckUserIds)),
        visibility: doc.visibility === 'private' ? 'private' : 'public',
        member_ids: ctx.users(idsOf(doc.memberIds)),
        created_by: ctx.user(idOf(doc.userId)) ?? ctx.owner,
        created_at: createdOf(doc, doc.createdAt),
      }),
    );
  },
});

const legacyStageStep = (database: Database): Step => ({
  source: `${database}.ticket stages (tickets_stages, stages)`,
  documents: async (ctx) => (await load(ctx, database)).stages,
  transform: (doc, ctx) => {
    const id = docId(doc);
    const name = textOf(doc.name);
    const pipelineId = ctx.known('pipeline', idOf(doc.pipelineId));

    const siblings = (legacies.get(database)?.stages ?? [])
      .filter((stage) => idOf(stage.pipelineId) === idOf(doc.pipelineId))
      .toSorted((a, b) => (intOf(a.order) ?? 0) - (intOf(b.order) ?? 0));

    if (!id || !name) return skip('no name');

    if (ctx.known('status', id)) return skip('already in erxes by id');

    if (!pipelineId) return skip('its pipeline is gone');

    const index = siblings.findIndex((stage) => docId(stage) === id);

    return put(
      statusRow(ctx, id, pipelineId, {
        name,
        type: statusTypeAt(index, siblings.length),
        order: intOf(doc.order) ?? index,
        visibility_type: doc.visibility === 'private' ? 'private' : 'public',
        member_ids: ctx.users(idsOf(doc.memberIds)),
        can_edit_member_ids: ctx.users(idsOf(doc.canEditMemberIds)),
        can_move_member_ids: ctx.users(idsOf(doc.canMoveMemberIds)),
        created_at: createdOf(doc, doc.createdAt),
      }),
    );
  },
});

const orphanPipelineStep: Step = {
  source: 'import.tickets-without-stage',
  documents: () => [{ _id: ORPHAN_PIPELINE }],
  transform: (_doc, ctx) =>
    put(
      pipelineRow(ctx, ORPHAN_PIPELINE, FALLBACK_CHANNEL, {
        name: 'Old tickets without a stage',
        description:
          'Old erxes tickets whose stage or pipeline was deleted. Move them to their pipelines.',
        created_by: ctx.owner,
      }),
      statusRow(ctx, ORPHAN_STATUS, ORPHAN_PIPELINE, { name: 'Imported', type: 2, order: 0 }),
    ),
};

/** Labels on old tickets become ticket tags, once per name. */
const labelTags = (
  ctx: Context,
  legacy: Legacy,
  labelIds: string[],
  names: Map<string, string>,
) => {
  const puts: Put[] = [];

  const tagIds = labelIds.flatMap((labelId) => {
    const known = ctx.known('label', labelId);

    if (known) return [known];

    const label = legacy.labels.get(labelId);
    const name = textOf(label?.name);

    if (!label || !name) return [];

    const key = `ticket:${name.toLowerCase()}`;
    const tagId = names.get(key) ?? labelId;

    ctx.remember('label', labelId, tagId);

    if (tagId === labelId) {
      names.set(key, labelId);
      puts.push([
        'frontline_tags',
        {
          id: labelId,
          type: 'ticket',
          name,
          color_code: textOf(label.colorCode),
          created_by: ctx.user(idOf(label.createdBy)) ?? ctx.owner,
          created_at: createdOf(label, label.createdAt),
        },
      ]);
    }

    return [tagId];
  });

  return { puts, tagIds };
};

const legacyTicketStep = (database: Database): Step => {
  let names = new Map<string, string>();

  return {
    source: `${database}.tickets`,
    documents: async (ctx) => {
      await load(ctx, database);
      await loadNumbers(ctx);
      names = await ctx.keyed('frontline_tags', "type || ':' || lower(name)");

      return ctx.find(dbOf(ctx, database), 'tickets');
    },
    transform: (doc, ctx) => {
      const legacy = legacies.get(database);
      const id = docId(doc);

      if (!id || !legacy) return skip('no id');

      if (already(ctx, 'ticket', id)) return skip('already in erxes by id');

      const statusId = ctx.known('status', idOf(doc.stageId)) ?? ORPHAN_STATUS;
      const pipelineId = ctx.known('status.pipeline', statusId) ?? ORPHAN_PIPELINE;
      const channelId = ctx.known('pipeline.channel', pipelineId) ?? FALLBACK_CHANNEL;
      const labels = labelTags(ctx, legacy, idsOf(doc.labelIds), names);
      const people = legacy.people.get(id) ?? { customers: [], companies: [] };

      const description = [textOfHtml(doc.description), ...(legacy.checklists.get(id) ?? [])]
        .filter(Boolean)
        .join('\n\n');

      const assignees = ctx.users(idsOf(doc.assignedUserIds));

      const [conversationId] = idsOf(doc.sourceConversationIds).filter((conversation) =>
        ctx.conversations.has(conversation),
      );

      const properties = Object.fromEntries(
        (Array.isArray(doc.customFieldsData) ? doc.customFieldsData : []).flatMap(
          (item: unknown) => {
            const entry = entriesOf(item);
            const field = ctx.field(idOf(entry.get('field')));

            return field && entry.get('value') !== undefined ? [[field, entry.get('value')]] : [];
          },
        ),
      );

      ctx.remember('ticket', id, id);

      return put(...labels.puts, [
        'frontline_tickets',
        {
          id,
          channel_id: channelId,
          pipeline_id: pipelineId,
          status_id: statusId,
          name: textOf(doc.name) ?? 'Untitled ticket',
          description,
          priority: PRIORITIES[String(doc.priority)] ?? 0,
          assignee_id: assignees[0] ?? null,
          assigned_member_ids: assignees,
          subscribed_user_ids: ctx.users(idsOf(doc.watchedUserIds)),
          tag_ids: [...new Set([...ctx.knownAll('tag', idsOf(doc.tagIds)), ...labels.tagIds])],
          start_date: dateOf(doc.startDate),
          target_date: dateOf(doc.closeDate),
          state: doc.status === 'archived' ? 'archived' : 'active',
          attachments: filesOf(doc.attachments),
          status_changed_at: createdOf(doc, doc.stageChangedDate, doc.modifiedAt, doc.createdAt),
          resolved_at: doc.isComplete === true ? dateOf(doc.modifiedAt) : null,
          created_by: ctx.user(idOf(doc.userId)),
          properties_data: properties,
          branch_id: ctx.knownAll('team', idsOf(doc.branchIds))[0] ?? null,
          department_id: ctx.knownAll('team', idsOf(doc.departmentIds))[0] ?? null,
          customer_id: ctx.customer(people.customers[0] ?? null),
          company_id: ctx.company(people.companies[0] ?? null),
          conversation_id: conversationId ?? null,
          created_at: createdOf(doc, doc.createdAt),
          updated_at: createdOf(doc, doc.modifiedAt, doc.createdAt),
        },
      ]);
    },
  };
};

/** Old ticket comments: a member's go to the customer; a customer's own have no place. */
const legacyCommentStep = (database: Database): Step => ({
  source: `${database}.ticket_comments`,
  documents: (ctx) => ctx.find(dbOf(ctx, database), 'ticket_comments'),
  transform: (doc, ctx) => {
    const id = docId(doc);
    const ticketId = ctx.known('ticket', idOf(doc.ticketId));
    const userId = ctx.user(idOf(doc.userId));
    const body = textOfHtml(doc.content);

    if (!id || !ticketId) return skip('its ticket is not imported');

    if (!userId) return skip("the customer's reply: a new ticket takes no customer comments");

    if (!body) return skip('no text');

    return put([
      'frontline_ticket_comments',
      {
        id,
        ticket_id: ticketId,
        body,
        created_by: userId,
        created_at: createdOf(doc, doc.createdAt),
      },
    ]);
  },
});

export const LEGACY_TICKET_STEPS: Step[] = [
  ...DATABASES.flatMap((database) => [legacyPipelineStep(database), legacyStageStep(database)]),
  orphanPipelineStep,
  ...DATABASES.flatMap((database) => [legacyTicketStep(database), legacyCommentStep(database)]),
];
