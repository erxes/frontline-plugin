import { useQuery } from '@tanstack/react-query';
import type { TConditionGroup } from 'erxes-ui';
import { between, ticketsPath } from '~/shared/listPath.ts';
import { choicesQuery } from '~/shared/reference.ts';
import type { useTicketReport } from './queries.ts';

type Entry = TConditionGroup['rules'][number];

/** The first status type that counts as resolved; the ones before it are open. */
const RESOLVED = 4;

/** Archived tickets too, as the report counts them. */
const ANY_STATE: Entry = { path: 'subject.state', op: 'in', value: ['active', 'archived'] };

/**
 * Where a ticket tile's numbers lead: the tickets list in the tile's pipeline, narrowed to what
 * the number counts, by whole days. Nothing links while a tile counts several pipelines, since
 * the list shows one at a time.
 */
export const useTicketLinks = ({ period, pick }: ReturnType<typeof useTicketReport>) => {
  const choices = useQuery(choicesQuery).data;
  const pipelines = choices?.pipelines ?? [];
  const pipelineId = pick.id ?? (pipelines.length === 1 ? pipelines[0]?.id : null);

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
