import { ORPCError } from '@orpc/server';
import { and, count, countDistinct, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS, SURVEY_EVENTS } from '#/core.ts';
import { channelMembers } from '#/db/schema.ts';
import { SurveyStep, surveys, surveyVotes } from '#/db/surveys.ts';
import { reads, writes } from '#/orpc.ts';
import { channelFor, membership, seenBy } from '../channels/access.ts';
import { changedEvent } from '../events.ts';
import { Ids, Title } from '../fields.ts';
import { compileFilter, type FilterFields } from '@erxes/plugin-sdk/filter';
import { FilterInput, likeText } from '../filter.ts';
import { newCode } from '../forms/shared.ts';
import { firstPageCount, orderOf, PageInput, PageOutput } from '../paging.ts';
import {
  checkTickets,
  publishSurveyEvents,
  Survey,
  surveyById,
  surveyRows,
  surveysFor,
} from './shared.ts';

/** Every step's question, for search. */
const questions = sql`(
  select string_agg(step ->> 'question', ' ') from jsonb_array_elements(${surveys.steps}) step
)`;

/** What the surveys list's filter bar narrows by (`ui/src/modules/surveys`). */
const SURVEY_FILTER: FilterFields = {
  'subject.title': { type: 'text', expr: surveys.title },
  'subject.question': { type: 'text', expr: questions },
  'subject.status': { type: 'select', expr: surveys.status },
  'subject.channelId': { type: 'select', expr: surveys.channelId },
  'subject.sentCount': { type: 'number', expr: surveys.sentCount },
  'subject.createdBy': { type: 'member', expr: surveys.createdBy },
  'subject.createdAt': { type: 'date', expr: surveys.createdAt },
  'subject.updatedAt': { type: 'date', expr: surveys.updatedAt },
};

const order = orderOf(surveys);

/** The surveys of the member's channels, newest first, narrowed by the filter bar. */
const list = reads(PERMISSIONS.channelView)
  .route({
    summary: 'List the surveys of your channels, newest first, filtered, searched and paged',
  })
  .input(z.object({ ...FilterInput, ...PageInput }))
  .output(
    z.object({
      surveys: z.array(Survey),
      ...PageOutput,
    }),
  )
  .handler(async ({ input, context: { tx, member } }) => {
    const matches = and(
      seenBy(member, surveys.channelId),
      input.search
        ? or(ilike(surveys.title, likeText(input.search)), ilike(questions, likeText(input.search)))
        : undefined,
      compileFilter(SURVEY_FILTER, input.filter, { me: member.userId }),
    );

    const rows = await surveyRows(tx, member)
      .where(and(matches, order.after(input.cursor)))
      .orderBy(...order.orderBy)
      .limit(input.limit + 1);

    const totalCount = await firstPageCount(input.cursor, () =>
      tx
        .select({ value: count() })
        .from(surveys)
        .leftJoin(channelMembers, membership(member, surveys.channelId))
        .where(matches),
    );

    const { items, nextCursor } = await order.page(tx, rows, input.limit);

    return { surveys: items, nextCursor, totalCount };
  });

const get = reads(PERMISSIONS.channelView)
  .route({ summary: 'Get one survey of a channel you belong to' })
  .input(z.object({ id: z.string() }))
  .output(Survey)
  .handler(async ({ input, context: { tx, member } }) => {
    await surveysFor(tx, member, [input.id], false);

    return surveyById(tx, member, input.id);
  });

/** How many voters a survey has, and how many of them picked each option, by option id. */
const results = reads(PERMISSIONS.channelView)
  .route({ summary: "Count a survey's voters and the voters who picked each option" })
  .input(z.object({ id: z.string() }))
  .output(z.object({ voterCount: z.number(), options: z.record(z.string(), z.number()) }))
  .handler(async ({ input, context: { tx, member } }) => {
    await surveysFor(tx, member, [input.id], false);

    const [voters] = await tx
      .select({ value: countDistinct(surveyVotes.voterId) })
      .from(surveyVotes)
      .where(eq(surveyVotes.surveyId, input.id));

    const options = await tx
      .select({ optionId: sql<string>`pick`, votes: countDistinct(surveyVotes.voterId) })
      .from(sql`${surveyVotes} cross join lateral unnest(${surveyVotes.optionIds}) pick`)
      .where(eq(surveyVotes.surveyId, input.id))
      .groupBy(sql`pick`);

    return {
      voterCount: voters?.value ?? 0,
      options: Object.fromEntries(options.map((row) => [row.optionId, row.votes])),
    };
  });

/** What a survey's settings accept. */
const SurveyFields = z.object({
  title: Title,
  channelId: z.string(),
  durationHours: z.number().int().min(1).max(768).nullable(),
  steps: z.array(SurveyStep).min(1).max(10),
});

/** What a change entry names each setting. */
const NAMES: [keyof z.infer<typeof Survey>, string][] = [
  ['title', 'title'],
  ['channelId', 'channel'],
  ['durationHours', 'duration'],
  ['steps', 'questions'],
];

/** Gives every step and option a distinct id, keeping the ids it was given once each. */
const distinctIds = (steps: z.output<typeof SurveyStep>[]) => {
  const taken = new Set<string>();

  const once = (id: string) => {
    const kept = taken.has(id) ? crypto.randomUUID() : id;

    taken.add(kept);

    return kept;
  };

  return steps.map((step) => ({
    ...step,
    id: once(step.id),
    options: step.options.map((option) => ({ ...option, id: once(option.id) })),
  }));
};

/** A new active survey in a channel the caller is an admin of. */
const create = writes(PERMISSIONS.channelView)
  .route({ summary: 'Create an active survey in a channel you admin' })
  .input(SurveyFields.partial({ durationHours: true }))
  .output(Survey)
  .handler(async ({ input, context: { tx, member } }) => {
    await channelFor(tx, member, input.channelId, { change: true });

    const steps = distinctIds(input.steps);

    await checkTickets(tx, input.channelId, steps);

    const [created] = await tx
      .insert(surveys)
      .values({
        ...input,
        steps,
        orgId: member.orgId,
        code: newCode(),
        createdBy: member.userId,
      })
      .returning({ id: surveys.id, title: surveys.title });

    if (!created) throw new ORPCError('INTERNAL_SERVER_ERROR');

    await publishSurveyEvents(tx, member, [
      {
        entityId: created.id,
        type: SURVEY_EVENTS.created.type,
        summary: `Created ${created.title}`,
        payload: { title: created.title, channelId: input.channelId },
      },
    ]);

    return surveyById(tx, member, created.id);
  });

/** Changes the given settings, the questions as a whole, or moves it to another channel. */
const update = writes(PERMISSIONS.channelView)
  .route({ summary: "Change a survey's settings or questions, or move it to another channel" })
  .input(SurveyFields.partial().extend({ id: z.string() }))
  .output(Survey)
  .handler(async ({ input: { id, ...fields }, context: { tx, member } }) => {
    const [survey] = await surveysFor(tx, member, [id], true);

    if (!survey) throw new ORPCError('NOT_FOUND', { message: 'No such survey' });

    const channelId = fields.channelId ?? survey.channelId;

    if (channelId !== survey.channelId) await channelFor(tx, member, channelId, { change: true });

    const steps = fields.steps && distinctIds(fields.steps);

    await checkTickets(tx, channelId, steps ?? survey.steps);

    const before = await surveyById(tx, member, id);

    await tx
      .update(surveys)
      .set({ ...fields, steps })
      .where(eq(surveys.id, id));

    const changed = await surveyById(tx, member, id);

    await publishSurveyEvents(
      tx,
      member,
      changedEvent(SURVEY_EVENTS.fieldsChanged.type, NAMES, before, changed),
    );

    return changed;
  });

/** Deletes the surveys with their votes: all of them, or none when one is refused. */
const remove = writes(PERMISSIONS.channelView)
  .route({ summary: 'Delete surveys with their votes, all or none' })
  .input(z.object({ ids: Ids }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx, member } }) => {
    await surveysFor(tx, member, input.ids, true);

    const removed = await tx
      .delete(surveys)
      .where(inArray(surveys.id, input.ids))
      .returning({ id: surveys.id });

    return { ids: removed.map((row) => row.id) };
  });

export const surveyProcedures = { list, get, results, create, update, remove };
