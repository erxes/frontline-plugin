import { listFilterQuery, type TConditionGroup, type TConditionRule, toIsoDay } from 'erxes-ui';
import { createSerializer, parseAsString } from 'nuqs';
import { PLUGIN } from '~/plugin.ts';

/** The address parameter naming the pipeline the tickets page shows. */
export const PIPELINE_PARAM = 'pipeline';

export const TICKETS_PATH = `/${PLUGIN}/tickets`;

export const INBOX_PATH = `/${PLUGIN}/inbox`;

const serialize = createSerializer({ ...listFilterQuery, [PIPELINE_PARAM]: parseAsString });

/** The rules that keep a date field `path` within the days from `from` to `to`, both included. */
export const between = (path: string, { from, to }: { from: Date; to: Date }): TConditionRule[] => [
  { path, op: 'gte', value: toIsoDay(from) },
  { path, op: 'lte', value: toIsoDay(to) },
];

/** A list narrowed to the channel `id`. */
export const channelRule = (id: string): TConditionRule => ({
  path: 'subject.channelId',
  op: 'in',
  value: [id],
});

/** The list at `path` narrowed to `rules`, as its filter bar keeps them in the address. */
export const listPath = (path: string, ...rules: TConditionRule[]) =>
  serialize(path, { advanced: { match: 'all', rules } });

/** The tickets of `pipeline`, narrowed to `rules` (rules or nested groups) when given. */
export const ticketsPath = (pipeline: string, rules: TConditionGroup['rules'] = []) =>
  serialize(TICKETS_PATH, {
    [PIPELINE_PARAM]: pipeline,
    advanced: rules.length ? { match: 'all', rules } : null,
  });
