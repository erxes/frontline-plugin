import {
  listFilterQuery,
  type TConditionGroup,
  type TConditionRule,
  toIsoDay,
  useListFilterParams,
} from 'erxes-ui';
import { createLoader, createSerializer, parseAsString } from 'nuqs';
import { useDeferredValue } from 'react';
import { PLUGIN } from '~/plugin.ts';

/** The address parameter naming the pipeline the tickets page shows. */
export const PIPELINE_PARAM = 'pipeline';

export const TICKETS_PATH = `/${PLUGIN}/tickets`;

export const INBOX_PATH = `/${PLUGIN}/inbox`;

const listParams = { ...listFilterQuery, [PIPELINE_PARAM]: parseAsString };

const serialize = createSerializer(listParams);

const parse = createLoader(listParams);

/** A filter bar's params for its list's query, as `useListFilterParams` reads them. */
export type FilterParams = ReturnType<typeof useListFilterParams>;

/**
 * What a list at `to` reads from its address: the filter bar's params, as `useListFilterParams`
 * gives them on that page, and the pipeline. A link loads its list's first page with them.
 */
export const listParamsOf = (to: string) => {
  const { advanced, searchValue, [PIPELINE_PARAM]: pipeline } = parse(new URL(to, location.origin));

  return {
    params: {
      filter: advanced?.rules.length ? JSON.stringify(advanced) : undefined,
      search: searchValue || undefined,
    } satisfies FilterParams,
    pipeline,
  };
};

/**
 * The filter bar's params, a change held back while the list it asks for loads: the old rows stay
 * on screen until the new ones are in, instead of a skeleton.
 */
export const useListParams = () => {
  const { filter, search } = useListFilterParams();

  return { filter: useDeferredValue(filter), search: useDeferredValue(search) };
};

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
