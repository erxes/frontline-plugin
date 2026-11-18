import { useQuery } from '@tanstack/react-query';
import { type TConditionGroup, toIsoDay } from 'erxes-ui';
import { ticketsPath } from '~/shared/listPath.ts';
import { choicesQuery } from '~/shared/reference.ts';
import type { useTicketReport } from './queries.ts';

type Entry = TConditionGroup['rules'][number];

/** The first status type that counts as resolved; the ones before it are open. */
const RESOLVED = 4;

/** Archived tickets too, as the report counts them. */
const ANY_STATE: Entry = { path: 'subject.state', op: 'in', value: ['active', 'archived'] };

const between = (path: string, { from, to }: { from: Date; to: Date }): Entry[] => [
  { path, op: 'gte', value: toIsoDay(from) },
  { path, op: 'lte', value: toIsoDay(to) },
];

/**
 * Where a ticket tile's numbers lead: the tickets list in the tile's pipeline, narrowed to what
 * the number counts, by whole days. Nothing links while a tile counts several pipelines, since
 * the list shows one at a time.
 */
export const useTicketLinks = ({ period, pipeline }: ReturnType<typeof useTicketReport>) => {
  const choices = useQuery(choicesQuery).data;
  const pipelines = choices?.pipelines ?? [];
  const pipelineId = pipeline.pipelineId ?? (pipelines.length === 1 ? pipelines[0]?.id : null);

  const openIds = (choices?.statuses ?? [])
    .filter((status) => status.pipelineId === pipelineId && status.type < RESOLVED)
    .map((status) => status.id);

  const to = (...rules: Entry[]) => (pipelineId ? ticketsPath(pipelineId, rules) : undefined);
  const open: Entry = { path: 'subject.statusId', op: 'in', value: openIds };

  return {
    /** The period's new tickets, narrowed further by `rules`. */
    created: (...rules: Entry[]) =>
      to(ANY_STATE, ...between('subject.createdAt', period.range), ...rules),
    resolved: () => to(ANY_STATE, ...between('subject.resolvedAt', period.range)),
    /** The tickets open now, narrowed further by `rules`. */
    open: (...rules: Entry[]) => (openIds.length ? to(open, ...rules) : undefined),
  };
};
