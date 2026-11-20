import type { InferClientInputs, InferClientOutputs } from '@orpc/client';
import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useIsFetching,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { toast, useLiveSignal } from 'erxes-ui';
import { parseAsStringLiteral, useQueryState, useQueryStates } from 'nuqs';
import { useDeferredValue } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { PLUGIN } from '~/plugin.ts';
import { useChange, useOptimistic } from '~/shared/hooks.ts';
import { listParamsOf, PIPELINE_PARAM, useListParams } from '~/shared/listPath.ts';
import { useChannelScope } from '~/shared/channelScope.ts';
import { useConfirmDelete } from '~/shared/Records.tsx';
import { type PageParam, pageOptions, usePaged } from '~/shared/paging.ts';
import { choicesQuery, FRESH_MS } from '~/shared/reference.ts';

type Outputs = InferClientOutputs<Client>['tickets'];

/** A ticket in its panel, with the description and attachments. */
export type Ticket = Outputs['get'];

/** A ticket as the list, board and table show it, without what only its panel shows. */
export type TicketRow = Outputs['list']['tickets'][number];

export type TicketChange = Omit<InferClientInputs<Client>['tickets']['update'], 'id'>;

export type BulkChange = Omit<InferClientInputs<Client>['tickets']['bulkUpdate'], 'ids'>;

export type SlaState = NonNullable<Ticket['firstResponseSla']>;

type ListInput = Omit<InferClientInputs<Client>['tickets']['list'], 'cursor'>;

type Choices = InferClientOutputs<Client>['pipelines']['choices'];

/** The field the tickets sort by and its direction, in the address beside the filter. */
export const useTicketSort = () =>
  useQueryStates({
    sort: parseAsStringLiteral(['updatedAt', 'createdAt'] as const).withDefault('updatedAt'),
    direction: parseAsStringLiteral(['desc', 'asc'] as const).withDefault('desc'),
  });

/**
 * The pipeline the tickets page shows: the one picked into the address, else the first, of the
 * channel the page is inside when it is.
 */
const shownOf = ({ pipelines }: Choices, picked: string | null, channelId: string | null) => {
  const own = channelId
    ? pipelines.filter((pipeline) => pipeline.channelId === channelId)
    : pipelines;

  return own.find((pipeline) => pipeline.id === picked) ?? own[0];
};

/** The pipelines and statuses of the member's channels: what a ticket is filed under. */
export const useChoices = () => {
  const { data, isPending, error } = useQuery(choicesQuery);

  return { pipelines: data?.pipelines ?? [], statuses: data?.statuses ?? [], isPending, error };
};

/**
 * The pipeline the tickets page shows, one at a time as the old page did: the one the sidebar
 * picked into the address, else the member's first.
 */
export const useTicketPipeline = () => {
  const [picked] = useQueryState(PIPELINE_PARAM);
  const { data } = useQuery(choicesQuery);
  const channelId = useChannelScope();

  return data && shownOf(data, picked, channelId);
};

/**
 * The sidebar's pick, held back while its tickets load, so the old pipeline's statuses and
 * tickets stay on screen together until the new ones are in.
 */
const useShownPick = () => useDeferredValue(useQueryState(PIPELINE_PARAM)[0]);

/** The pipeline whose tickets show, suspending until the choices are in. */
export const useShownPipeline = () =>
  shownOf(useSuspenseQuery(choicesQuery).data, useShownPick(), useChannelScope());

/**
 * The id of the pipeline whose tickets and statuses show. The pick asks at once, beside the
 * choices, and holds unless they don't have it.
 */
export const useShownPipelineId = () => {
  const picked = useShownPick();
  const { data } = useQuery(choicesQuery);
  const channelId = useChannelScope();

  return data ? shownOf(data, picked, channelId)?.id : (picked ?? undefined);
};

/** The tickets `input` asks for, in pages. */
const ticketsOptions = (input: ListInput) =>
  orpc.tickets.list.infiniteOptions({
    input: ({ cursor }: PageParam) => ({ ...input, cursor }),
    ...pageOptions,
    staleTime: FRESH_MS,
  });

const rowsOf = (page: Outputs['list']) => page.tickets;

/**
 * What the shown pipeline's tickets are asked with, a board column's in its `statusId`. A change
 * is held back while its tickets load, so the old ones stay on screen until the new ones are in.
 */
const useListInput = (statusId?: string) => {
  const [{ sort, direction }] = useTicketSort();

  return {
    ...useListParams(),
    pipelineId: useShownPipelineId(),
    statusId,
    sort: useDeferredValue(sort),
    ascending: useDeferredValue(direction) === 'asc',
  };
};

/**
 * The shown pipeline's tickets the filter bar keeps, in the chosen order, a page at a time, for
 * the table. It suspends until the first page is in; render it only once the member has a pipeline.
 */
export const useTickets = () =>
  usePaged(useSuspenseInfiniteQuery(ticketsOptions(useListInput())), rowsOf);

/**
 * A status's tickets, for its board column or list group: those of the shown pipeline in
 * `statusId`, a page at a time. A folded group passes `enabled: false` and asks for none.
 */
export const useColumnTickets = (statusId: string, enabled = true) => {
  const input = useListInput(statusId);

  return usePaged(
    useInfiniteQuery({ ...ticketsOptions(input), enabled: enabled && Boolean(input.pipelineId) }),
    rowsOf,
  );
};

/**
 * How many tickets match the filter bar, for its count and the empty state of the board and the
 * grouped list: the first page of the query the table suspends on, asked once for all.
 */
export const useTicketCount = () =>
  usePaged(useInfiniteQuery(ticketsOptions(useListInput())), rowsOf).totalCount;

/**
 * Loads the tickets at `to` before they open: the first page of the pipeline it names, else the
 * member's first, in the default order.
 */
export const prefetchTickets = async (queryClient: QueryClient, to: string) => {
  const { params, pipeline } = listParamsOf(to);
  const pipelineId = shownOf(await queryClient.query(choicesQuery), pipeline, null)?.id;

  if (pipelineId)
    await queryClient.infiniteQuery(
      ticketsOptions({ ...params, pipelineId, sort: 'updatedAt', ascending: false }),
    );
};

/**
 * Another member's change to a ticket refetches the open lists, columns and ticket. The layout
 * listens on every page, so tickets loaded on another stay true while they count as fresh.
 */
export const useTicketsLive = () => {
  const queryClient = useQueryClient();

  useLiveSignal(
    PLUGIN,
    'tickets',
    () => void queryClient.invalidateQueries({ queryKey: orpc.tickets.key() }),
  );
};

export const ticketOptions = (id: string) =>
  orpc.tickets.get.queryOptions({ input: { id }, staleTime: FRESH_MS });

/** One ticket: every slot of its panel reads this query. */
export const useTicket = (id: string) => useQuery(ticketOptions(id));

/** Loads a ticket's panel before it opens, as the member points at its name: its slots and data. */
export const prefetchTicket = (queryClient: QueryClient, id: string) =>
  Promise.all([import('./slots.ts'), queryClient.query(ticketOptions(id))]);

/** Refetches every ticket query after a change, and shows a refusal. */
export const useTicketChange = () => useChange(orpc.tickets.key());

type TicketPages = InfiniteData<Outputs['list'], PageParam>;

/** The queries a ticket's edit writes into before the API answers: the lists and each ticket. */
const TICKET_ROWS = [orpc.tickets.list.key(), orpc.tickets.get.key()];

/** A board column's pages: the list asked for one status. */
const columnKey = (statusId: string) =>
  orpc.tickets.list.key({ type: 'infinite', input: { statusId } });

/** The tickets the lists hold, by id; `active` keeps those of the lists on screen. */
const loadedTickets = (queryClient: QueryClient, type: 'all' | 'active' = 'all') =>
  new Map(
    queryClient
      .getQueriesData<TicketPages>({ queryKey: orpc.tickets.list.key({ type: 'infinite' }), type })
      .flatMap(([, data]) => data?.pages ?? [])
      .flatMap((page) => page.tickets)
      .map((ticket) => [ticket.id, ticket]),
  );

/** A loaded ticket, from any list that holds it. */
const cachedTicket = (queryClient: QueryClient, id: string) => loadedTickets(queryClient).get(id);

/**
 * The tickets the lists on screen hold, by id, such as every status group's of the list display.
 * It reads again as each list's request settles, when its new rows are in.
 */
export const useShownTickets = () => {
  useIsFetching({ queryKey: orpc.tickets.list.key({ type: 'infinite' }) });

  return loadedTickets(useQueryClient(), 'active');
};

/** The first page's count moved by `by`; later pages carry none. */
const recount = (pages: TicketPages['pages'], by: number) =>
  pages.map((page, index) =>
    index === 0 && page.totalCount !== undefined
      ? { ...page, totalCount: Math.max(0, page.totalCount + by) }
      : page,
  );

const withoutTicket = (data: TicketPages, id: string): TicketPages =>
  data.pages.some((page) => page.tickets.some((ticket) => ticket.id === id))
    ? {
        ...data,
        pages: recount(data.pages, -1).map((page) => ({
          ...page,
          tickets: page.tickets.filter((ticket) => ticket.id !== id),
        })),
      }
    : data;

/**
 * Puts the ticket where the API will list it among the loaded rows, `comesFirst` saying which of
 * two goes first; past the last loaded row of a longer list it comes with a later page.
 */
const withTicket = (
  data: TicketPages,
  moved: TicketRow,
  comesFirst: (a: TicketRow, b: TicketRow) => boolean,
): TicketPages => {
  const pages = recount(data.pages, 1);
  const at = pages.findIndex((page) => page.tickets.some((row) => comesFirst(moved, row)));

  if (at === -1 && pages.at(-1)?.nextCursor) return { ...data, pages };

  const target = at === -1 ? pages.length - 1 : at;

  return {
    ...data,
    pages: pages.map((page, index) => {
      if (index !== target) return page;

      const before = page.tickets.findIndex((row) => comesFirst(moved, row));
      const tickets = [...page.tickets];

      tickets.splice(before === -1 ? tickets.length : before, 0, moved);

      return { ...page, tickets };
    }),
  };
};

/**
 * Saves the given fields of a ticket, or moves it to another status of its pipeline. The list,
 * the board and the open ticket show the change at once, and a moved card leaves its column for
 * its new one, in the place the sort gives it; a property waits for the API, which parses it.
 */
const useUpdateTicket = () => {
  const [{ sort, direction }] = useTicketSort();

  const comesFirst = (a: TicketRow, b: TicketRow) =>
    direction === 'asc'
      ? a[sort].getTime() < b[sort].getTime()
      : a[sort].getTime() > b[sort].getTime();

  return useMutation(
    orpc.tickets.update.mutationOptions(
      useOptimistic(TICKET_ROWS, (queryClient, change: TicketChange & { id: string }) => {
        const apply = <Row extends TicketRow>(ticket: Row): Row =>
          ticket.id === change.id
            ? { ...ticket, ...change, propertiesData: ticket.propertiesData }
            : ticket;

        const from = cachedTicket(queryClient, change.id);

        if (from && change.statusId && change.statusId !== from.statusId) {
          const moved = { ...apply(from), updatedAt: new Date() };

          queryClient.setQueriesData<TicketPages>(
            { queryKey: columnKey(from.statusId) },
            (data) => data && withoutTicket(data, from.id),
          );
          queryClient.setQueriesData<TicketPages>(
            { queryKey: columnKey(change.statusId) },
            (data) => data && withTicket(data, moved, comesFirst),
          );
        }

        queryClient.setQueriesData<TicketPages>(
          { queryKey: orpc.tickets.list.key({ type: 'infinite' }) },
          (data) =>
            data && {
              ...data,
              pages: data.pages.map((page) => ({ ...page, tickets: page.tickets.map(apply) })),
            },
        );
        queryClient.setQueryData(
          orpc.tickets.get.queryKey({ input: { id: change.id } }),
          (ticket) => ticket && apply(ticket),
        );
      }),
    ),
  );
};

/** `useUpdateTicket` for one ticket. */
export const useEditTicket = (id: string) => {
  const update = useUpdateTicket();

  return (change: TicketChange) => update.mutate({ id, ...change });
};

/**
 * What a list's rows change, made once for the whole list and handed to each row: edit one
 * ticket, or delete some after asking.
 */
export const useTicketRowActions = () => {
  const update = useUpdateTicket();
  const follow = useMutation(orpc.tickets.follow.mutationOptions(useTicketChange()));
  const { deleteTickets } = useDeleteTickets();

  return {
    edit: (id: string, change: TicketChange) => update.mutate({ id, ...change }),
    follow: (id: string, following: boolean) => follow.mutate({ id, following }),
    deleteTickets,
  };
};

export type TicketRowActions = ReturnType<typeof useTicketRowActions>;

/** Changes the selected tickets in one request; `done` runs after. */
export const useBulkChange = () => {
  const bulk = useMutation(orpc.tickets.bulkUpdate.mutationOptions(useTicketChange()));

  return {
    change: (ids: string[], change: BulkChange, done?: () => void) =>
      bulk.mutate({ ids, ...change }, { onSuccess: done }),
    isPending: bulk.isPending,
  };
};

/** Asks for "delete" to be typed, then deletes the tickets in one request; `done` runs after. */
export const useDeleteTickets = () => {
  const { t } = useTranslation('frontline');
  const confirm = useConfirmDelete();
  const change = useTicketChange();

  const remove = useMutation(
    orpc.tickets.bulkRemove.mutationOptions({
      ...change,
      onSuccess: ({ ids }) => {
        toast({
          title: t('tickets-deleted', {
            defaultValue_one: 'Ticket deleted',
            defaultValue_other: '{{count}} tickets deleted',
            count: ids.length,
          }),
        });
        change.onSuccess();
      },
    }),
  );

  const deleteTickets = async (ids: string[], done?: () => void) => {
    await confirm(
      t('delete-tickets-confirm', {
        defaultValue_one: 'Delete this ticket?',
        defaultValue_other: 'Delete {{count}} tickets?',
        count: ids.length,
      }),
    );
    remove.mutate({ ids }, { onSuccess: done });
  };

  return { deleteTickets, isPending: remove.isPending };
};

/** What each SLA state reads as. */
export const useSlaNames = (): Record<SlaState, string> => {
  const { t } = useTranslation('frontline');

  return {
    due: t('sla-due', 'Due'),
    overdue: t('sla-overdue', 'Overdue'),
    met: t('sla-met', 'Met'),
    missed: t('sla-missed', 'Missed'),
  };
};
