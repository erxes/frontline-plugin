import { ORPCError } from '@orpc/server';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS, SURVEY_EVENTS } from '#/core.ts';
import { SURVEY_STATUSES, surveys } from '#/db/surveys.ts';
import { writes } from '#/orpc.ts';
import { Ids } from '../fields.ts';
import { publishSurveyEvents, surveysFor } from './shared.ts';

type Status = (typeof SURVEY_STATUSES)[number];

/**
 * Where a survey may go from each status. Imported requests arrive pending and are approved or
 * rejected; a rejected one may still be approved; an active one is archived and back.
 */
const MOVES: Record<Status, Status[]> = {
  pending: ['active', 'rejected'],
  rejected: ['active'],
  active: ['archived'],
  archived: ['active'],
};

const SUMMARIES: Record<Status, string> = {
  pending: 'Sent the survey back for review',
  active: 'Made the survey active',
  rejected: 'Rejected the survey',
  archived: 'Archived the survey',
};

/**
 * Moves the surveys to `status`, all of them or none: a rejection keeps its `reason`, any other
 * move clears it.
 */
const setStatus = writes(PERMISSIONS.channelView)
  .input(
    z.object({
      ids: Ids,
      status: z.enum(SURVEY_STATUSES),
      reason: z.string().trim().max(500).optional(),
    }),
  )
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx, member } }) => {
    const rows = await surveysFor(tx, member, input.ids, true);
    const moving = rows.filter((row) => row.status !== input.status);

    if (moving.some((row) => !MOVES[row.status].includes(input.status)))
      throw new ORPCError('CONFLICT', {
        message: `A survey can't move to ${input.status} from where it is`,
      });

    if (moving.length === 0) return { ids: [] };

    const rejectionReason = input.status === 'rejected' ? input.reason || null : null;

    await tx
      .update(surveys)
      .set({ status: input.status, rejectionReason })
      .where(
        inArray(
          surveys.id,
          moving.map((row) => row.id),
        ),
      );

    await publishSurveyEvents(
      tx,
      member,
      moving.map((row) => ({
        entityId: row.id,
        type: SURVEY_EVENTS.fieldsChanged.type,
        summary: SUMMARIES[input.status],
        payload: {
          fields: ['status'],
          before: { status: row.status },
          after: { status: input.status, rejectionReason },
        },
      })),
    );

    return { ids: moving.map((row) => row.id) };
  });

export const surveyStatusProcedures = { setStatus };
