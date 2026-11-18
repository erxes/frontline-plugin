import type { InferClientInputs, InferClientOutputs } from '@orpc/client';
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { toast, useListFilterParams, useLiveSignal } from 'erxes-ui';
import { parseAsStringLiteral, useQueryState, useQueryStates } from 'nuqs';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { PLUGIN } from '~/plugin.ts';
import { useChange, useOptimistic } from '~/shared/hooks.ts';
import { useConfirmDelete } from '~/shared/Records.tsx';
import { type PageParam, pageOptions, usePaged } from '~/shared/paging.ts';
import { choicesQuery } from '~/shared/reference.ts';

type Outputs = InferClientOutputs<Client>['tickets'];

export type Ticket = Outputs['get'];

export type TicketChange = Omit<InferClientInputs<Client>['tickets']['update'], 'id'>;

export type BulkChange = Omit<InferClientInputs<Client>['tickets']['bulkUpdate'], 'ids'>;

export type SlaState = NonNullable<Ticket['firstResponseSla']>;

/** The field the tickets sort by and its direction, in the address beside the filter. */
export const useTicketSort = () =>
  useQueryStates({
    sort: parseAsStringLiteral(['updatedAt', 'createdAt'] as const).withDefault('updatedAt'),
    direction: parseAsStringLiteral(['desc', 'asc'] as const).withDefault('desc'),
  });

/** The address's key for the pipeline the tickets page shows. */
export const PIPELINE_PARAM = 'pipeline';

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
  const { pipelines } = useChoices();

  return pipelines.find((pipeline) => pipeline.id === picked) ?? pipelines[0];
};

/**
 * The shown pipeline's tickets the filter bar keeps, in the chosen order, a page at a time.
 * Another member's change refetches them, and the open ticket.
 */
export const useTickets = () => {
  const params = useListFilterParams();
  const [{ sort, direction }] = useTicketSort();
  const [picked] = useQueryState(PIPELINE_PARAM);
  const choices = useChoices();
  const shown = useTicketPipeline()?.id;
  // The sidebar's pick asks at once, beside the choices, and holds unless they don't have it.
  const pipelineId = choices.isPending ? (picked ?? undefined) : shown;
  const ascending = direction === 'asc';
  const queryClient = useQueryClient();

  useLiveSignal(
    PLUGIN,
    'tickets',
    () => void queryClient.invalidateQueries({ queryKey: orpc.tickets.key() }),
  );

  const query = usePaged(
    useInfiniteQuery(
      orpc.tickets.list.infiniteOptions({
        input: ({ cursor }: PageParam) => ({ ...params, pipelineId, sort, ascending, cursor }),
        ...pageOptions,
        enabled: Boolean(pipelineId),
      }),
    ),
    (page) => page.tickets,
  );

  // The rows group by the choices' statuses, so the list waits for both. Without a pipeline it
  // never asks, and shows the choices' refusal.
  return {
    ...query,
    isPending: choices.isPending || (Boolean(pipelineId) && query.isPending),
    error: choices.error ?? query.error,
  };
};

/** One ticket: every slot of its panel reads this query. */
export const useTicket = (id: string) => useQuery(orpc.tickets.get.queryOptions({ input: { id } }));

/** Refetches every ticket query after a change, and shows a refusal. */
export const useTicketChange = () => useChange(orpc.tickets.key());

type TicketPages = InfiniteData<Outputs['list'], PageParam>;

/** The queries a ticket's edit writes into before the API answers: the lists and each ticket. */
const TICKET_ROWS = [orpc.tickets.list.key(), orpc.tickets.get.key()];

/**
 * Saves the given fields of a ticket, or moves it to another status of its pipeline. The list,
 * the board and the open ticket show the change at once; a property waits for the API, which
 * parses it.
 */
const useUpdateTicket = () =>
  useMutation(
    orpc.tickets.update.mutationOptions(
      useOptimistic(TICKET_ROWS, (queryClient, change: TicketChange & { id: string }) => {
        const apply = (ticket: Ticket) =>
          ticket.id === change.id
            ? { ...ticket, ...change, propertiesData: ticket.propertiesData }
            : ticket;

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
  const { deleteTickets } = useDeleteTickets();

  return {
    edit: (id: string, change: TicketChange) => update.mutate({ id, ...change }),
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
