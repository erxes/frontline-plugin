import { ORPCError } from '@orpc/server';
import { and, countDistinct, eq, getTableColumns, sql } from 'drizzle-orm';
import { z } from 'zod';
import { type Tx, withOrg } from '#/db/client.ts';
import { conversations, messages } from '#/db/inbox.ts';
import { SurveyOption, SurveyStep, surveys, surveyTickets, surveyVotes } from '#/db/surveys.ts';
import { pipelines } from '#/db/tickets.ts';
import { inOrder } from '../integrations/provider.ts';
import type { Visitor } from '../messenger/session.ts';
import { asVisitor } from '../messenger/threads.ts';
import { insertTicket } from '../tickets/tickets.ts';

const { orgId: _orgId, ...surveyColumns } = getTableColumns(surveys);

/** A step as a visitor sees it: its options without the ticket rules members set. */
const VisitorStep = SurveyStep.pick({
  id: true,
  name: true,
  description: true,
  question: true,
  attachments: true,
  allowMultiselect: true,
}).extend({ options: z.array(SurveyOption.pick({ id: true, text: true })) });

const Params = z.object({ messageId: z.string() });

const Vote = z.object({ optionIds: z.array(z.string()).max(100) });

/**
 * The survey sent in the visitor's message `messageId`, with when voting closes: `durationHours`
 * after it was sent, or never without one. NOT_FOUND for another visitor's message.
 */
const sentSurvey = async (tx: Tx, visitor: Visitor, messageId: string) => {
  const [row] = await tx
    .select({
      survey: surveyColumns,
      conversationId: messages.conversationId,
      closesAt:
        sql<Date | null>`${messages.createdAt} + make_interval(hours => ${surveys.durationHours})`.mapWith(
          messages.createdAt,
        ),
    })
    .from(messages)
    .innerJoin(surveys, eq(surveys.id, messages.surveyId))
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        eq(messages.id, messageId),
        eq(conversations.integrationId, visitor.integrationId),
        eq(conversations.customerId, visitor.customerId),
      ),
    );

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such survey' });

  const open = row.survey.status === 'active' && (!row.closesAt || row.closesAt > new Date());

  return { ...row, open };
};

/** The visitor's picks in the message, or none before they vote. */
const picksOf = async (tx: Tx, visitor: Visitor, messageId: string) => {
  const [vote] = await tx
    .select({ optionIds: surveyVotes.optionIds })
    .from(surveyVotes)
    .where(and(eq(surveyVotes.messageId, messageId), eq(surveyVotes.voterId, visitor.customerId)));

  return vote?.optionIds ?? [];
};

/** Refuses picks that aren't the survey's options, or several in a one-choice question. */
const checkPicks = (steps: z.output<typeof SurveyStep>[], optionIds: string[]) => {
  const picked = new Set(optionIds);
  const known = new Set(steps.flatMap((step) => step.options.map((option) => option.id)));

  if ([...picked].some((id) => !known.has(id)))
    throw new ORPCError('BAD_REQUEST', { message: 'Pick options of this survey' });

  const tooMany = steps.some(
    (step) =>
      !step.allowMultiselect && step.options.filter((option) => picked.has(option.id)).length > 1,
  );

  if (tooMany) throw new ORPCError('BAD_REQUEST', { message: 'Pick one option per question' });
};

/**
 * Opens the ticket of each picked option whose voters reached its threshold, once per option,
 * in the option's pipeline and status, created by the survey's author.
 */
const openTickets = async (tx: Tx, survey: typeof surveys.$inferSelect, optionIds: string[]) => {
  const picked = new Set(optionIds);

  const armed = survey.steps.flatMap((step) =>
    step.options.flatMap((option) =>
      option.ticket && picked.has(option.id) ? [{ step, option, rule: option.ticket }] : [],
    ),
  );

  // One at a time: the queries share the transaction's connection.
  await inOrder(armed, async ({ step, option, rule }) => {
    const [votes] = await tx
      .select({ value: countDistinct(surveyVotes.voterId) })
      .from(surveyVotes)
      .where(
        and(
          eq(surveyVotes.surveyId, survey.id),
          sql`${surveyVotes.optionIds} @> array[${option.id}]::text[]`,
        ),
      );

    const [opened] = await tx
      .select({ ticketId: surveyTickets.ticketId })
      .from(surveyTickets)
      .where(and(eq(surveyTickets.surveyId, survey.id), eq(surveyTickets.optionId, option.id)));

    const [pipeline] = await tx
      .select({ channelId: pipelines.channelId })
      .from(pipelines)
      .where(eq(pipelines.id, rule.pipelineId));

    if (opened || !pipeline || (votes?.value ?? 0) < rule.threshold) return;

    const ticketId = await insertTicket(
      tx,
      { orgId: survey.orgId, userId: null },
      {
        pipelineId: rule.pipelineId,
        statusId: rule.statusId,
        channelId: pipeline.channelId,
        name: `${survey.title}: ${option.text}`.slice(0, 200),
        description: [
          `Survey: ${survey.title}`,
          `Question: ${step.question}`,
          `Option: ${option.text}`,
          `Votes: ${votes?.value ?? 0} (threshold ${rule.threshold})`,
        ].join('\n'),
        createdBy: survey.createdBy,
      },
    );

    await tx
      .insert(surveyTickets)
      .values({ orgId: survey.orgId, surveyId: survey.id, optionId: option.id, ticketId });
  });
};

/** The survey in the visitor's message: its questions, whether voting is open, and their picks. */
const visitorSurvey = async (tx: Tx, visitor: Visitor, messageId: string) => {
  const { survey, closesAt, open } = await sentSurvey(tx, visitor, messageId);

  return {
    messageId,
    title: survey.title,
    steps: z.array(VisitorStep).parse(survey.steps),
    closesAt,
    open,
    optionIds: await picksOf(tx, visitor, messageId),
  };
};

export type VisitorSurvey = Awaited<ReturnType<typeof visitorSurvey>>;

const read = asVisitor(async (visitor, req, res) => {
  const { messageId } = Params.parse(req.params);

  res.json(await withOrg(visitor.orgId, (tx) => visitorSurvey(tx, visitor, messageId)));
});

/**
 * The visitor votes in the message, replacing their earlier picks, while voting is open. Votes
 * on one survey are counted one at a time, so its tickets open once.
 */
const vote = asVisitor(async (visitor, req, res) => {
  const { messageId } = Params.parse(req.params);
  const { optionIds } = Vote.parse(req.body);

  await withOrg(visitor.orgId, async (tx) => {
    const { survey, conversationId, open } = await sentSurvey(tx, visitor, messageId);

    if (!open) throw new ORPCError('BAD_REQUEST', { message: 'Voting on this survey has closed' });

    checkPicks(survey.steps, optionIds);

    // Holds the survey, so two votes can't both find its threshold unreached.
    const [held] = await tx
      .select({ ...getTableColumns(surveys) })
      .from(surveys)
      .where(eq(surveys.id, survey.id))
      .for('update');

    if (!held) throw new ORPCError('NOT_FOUND', { message: 'No such survey' });

    await tx
      .insert(surveyVotes)
      .values({
        orgId: visitor.orgId,
        surveyId: survey.id,
        conversationId,
        messageId,
        voterId: visitor.customerId,
        customerId: visitor.customerId,
        optionIds: [...new Set(optionIds)],
      })
      .onConflictDoUpdate({
        target: [surveyVotes.orgId, surveyVotes.messageId, surveyVotes.voterId],
        set: { optionIds: [...new Set(optionIds)] },
      });

    await openTickets(tx, held, optionIds);
  });

  res.status(204).end();
});

/** A visitor's surveys, under `/api/public/messenger`. */
export const voteRoutes = { read, vote };
