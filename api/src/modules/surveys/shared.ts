import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, asc, count, eq, getTableColumns, inArray, isNotNull, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PLUGIN } from '#/config.ts';
import { SURVEY_TIMELINE } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { channelMembers } from '#/db/schema.ts';
import { SurveyStep, surveys, surveyVotes } from '#/db/surveys.ts';
import { pipelineStatuses, pipelines } from '#/db/tickets.ts';
import { canChangeSql, channelFor, managesAll, membership } from '../channels/access.ts';
import { publishEvents, type RecordEvent } from '../events.ts';

const { orgId, ...surveyColumns } = getTableColumns(surveys);

/** How many votes a survey has, selected beside its row. */
const voteCount = sql<number>`(
  select ${count()}::int from ${surveyVotes} where ${surveyVotes.surveyId} = ${surveys.id}
)`;

/** The row, whether the caller may change it and how many votes it has. */
export const Survey = createSelectSchema(surveys, { steps: () => z.array(SurveyStep) })
  .omit({ orgId: true })
  .extend({ canManage: z.boolean(), voteCount: z.number() });

/** Surveys with what the caller may do. Callers narrow them with `seenBy`. */
export const surveyRows = (tx: Tx, member: PluginMember) =>
  tx
    .select({ ...surveyColumns, canManage: canChangeSql(member), voteCount })
    .from(surveys)
    .leftJoin(channelMembers, membership(member, surveys.channelId))
    .$dynamic();

/** The surveys `member` sees: their channels', or every channel's for one who manages them all. */
export const seenBy = (member: PluginMember) =>
  managesAll(member) ? undefined : isNotNull(channelMembers.userId);

export const surveyById = async (tx: Tx, member: PluginMember, id: string) => {
  const [row] = await surveyRows(tx, member).where(eq(surveys.id, id));

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such survey' });

  return row;
};

/**
 * The surveys of `ids`, all of them or NOT_FOUND, oldest first: their channels' members read
 * them, with `change` only their admins. Each channel is held once, in id order.
 */
export const surveysFor = async (tx: Tx, member: PluginMember, ids: string[], change: boolean) => {
  const rows = await tx
    .select(surveyColumns)
    .from(surveys)
    .where(inArray(surveys.id, ids))
    .orderBy(asc(surveys.createdAt), asc(surveys.id));

  if (rows.length !== new Set(ids).size)
    throw new ORPCError('NOT_FOUND', { message: 'No such survey' });

  const channelIds = [...new Set(rows.map((row) => row.channelId))].toSorted();

  await Promise.all(channelIds.map((channelId) => channelFor(tx, member, channelId, { change })));

  return rows;
};

/** Refuses an option's ticket rule unless its status is of its pipeline, in the survey's channel. */
export const checkTickets = async (
  tx: Tx,
  channelId: string,
  steps: z.output<typeof SurveyStep>[],
) => {
  const rules = steps.flatMap((step) => step.options.flatMap((option) => option.ticket ?? []));

  if (rules.length === 0) return;

  const found = await tx
    .select({ id: pipelineStatuses.id, pipelineId: pipelineStatuses.pipelineId })
    .from(pipelineStatuses)
    .innerJoin(pipelines, eq(pipelines.id, pipelineStatuses.pipelineId))
    .where(
      and(
        eq(pipelines.channelId, channelId),
        inArray(
          pipelineStatuses.id,
          rules.map((rule) => rule.statusId),
        ),
      ),
    );

  const ok = new Set(found.map((row) => `${row.pipelineId}/${row.id}`));

  if (rules.some((rule) => !ok.has(`${rule.pipelineId}/${rule.statusId}`)))
    throw new ORPCError('BAD_REQUEST', {
      message: "A ticket rule names a status outside the survey's channel",
    });
};

/** Puts the events on the surveys' timelines in core. */
export const publishSurveyEvents = (tx: Tx, member: PluginMember, events: RecordEvent[]) =>
  publishEvents(
    tx,
    {
      orgId: member.orgId,
      actorUserId: member.userId,
      entityType: SURVEY_TIMELINE,
      linkOf: (id) => `/${PLUGIN}/surveys/${encodeURIComponent(id)}`,
      audited: false,
    },
    events,
  );
