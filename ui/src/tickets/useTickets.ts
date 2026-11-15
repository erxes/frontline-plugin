import type { InferClientInputs, InferClientOutputs } from '@orpc/client';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { addPluginStyles, stored } from 'erxes-ui';
import { parseAsNumberLiteral, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { z } from 'zod';
import { PLUGIN } from '../config.tsx';
import { TICKETS_PATH } from '../paths.ts';
import { orpc } from '../orpc.ts';
import { PRIORITIES } from '../pipelines/queries.ts';
import { useChange, useParamPanel, useSearch } from '../shared/hooks.ts';
import css from './styles.css?inline';

// Every ticket screen imports this module, so their styles arrive with the first one.
addPluginStyles(`${PLUGIN}:tickets`, css);

export type Ticket = InferClientOutputs<Client>['tickets']['get'];

type ListInput = InferClientInputs<Client>['tickets']['list'];

export const ticketPath = (id: string) => `${TICKETS_PATH}/${id}`;

/** `?assignee=none` keeps the unassigned tickets. */
export const UNASSIGNED = 'none';

const STATES = ['active', 'archived', 'all'] as const;

/** The list's filters in the query string, under the old page's names. */
export const useTicketFilters = () =>
  useQueryStates({
    channelId: parseAsString,
    pipelineId: parseAsString,
    statusId: parseAsString,
    assignee: parseAsString,
    priority: parseAsNumberLiteral(PRIORITIES),
    state: parseAsStringLiteral(STATES),
  });

/** List or board, kept in this browser under the old plugin's key. */
export const ticketView = stored({
  key: 'ticketView',
  schema: z.enum(['list', 'grid']),
  initial: 'list',
});

/** The field the tickets sort by, and its direction (-1 newest first), under the old keys. */
export const ticketSort = stored({
  key: 'ticketSort',
  schema: z.enum(['updatedAt', 'createdAt']),
  initial: 'updatedAt',
});

export const ticketSortDirection = stored({
  key: 'ticketSortDirection',
  schema: z.union([z.literal(1), z.literal(-1)]),
  initial: -1,
});

/** The tickets the filters keep, a page at a time; `statusId` narrows them to one board column. */
export const useTickets = (
  { sort, direction }: { sort: ListInput['sort']; direction: 1 | -1 },
  statusId?: string,
) => {
  const search = useSearch() || undefined;
  const [filters] = useTicketFilters();

  const query = useInfiniteQuery(
    orpc.tickets.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        channelId: filters.channelId ?? undefined,
        pipelineId: filters.pipelineId ?? undefined,
        statusId: statusId ?? filters.statusId ?? undefined,
        assigneeId: filters.assignee === UNASSIGNED ? null : (filters.assignee ?? undefined),
        priority: filters.priority ?? undefined,
        state: filters.state ?? undefined,
        search,
        sort,
        ascending: direction === 1,
        cursor,
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  );

  return {
    ...query,
    tickets: query.data?.pages.flatMap((page) => page.tickets) ?? [],
    totalCount: query.data?.pages[0]?.totalCount,
  };
};

export const useTicket = (id: string) => useQuery(orpc.tickets.get.queryOptions({ input: { id } }));

/** Refetches every ticket query after a change, and shows a refusal. */
export const useTicketChange = () => useChange(orpc.tickets.key());

/** `?ticket=new` opens the create sheet. */
export const useTicketPanel = () => useParamPanel('ticket');
