import type { InferClientInputs, InferClientOutputs } from '@orpc/client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { toast, useListFilterParams, useLiveSignal } from 'erxes-ui';
import { parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { PLUGIN } from '~/plugin.ts';
import { useChange } from '~/shared/hooks.ts';
import { useConfirmDelete } from '~/shared/Records.tsx';

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

/**
 * The tickets the filter bar keeps, in the chosen order, a page at a time. Another member's
 * change refetches them, and the open ticket.
 */
export const useTickets = () => {
  const params = useListFilterParams();
  const [{ sort, direction }] = useTicketSort();
  const ascending = direction === 'asc';
  const queryClient = useQueryClient();

  useLiveSignal(
    PLUGIN,
    'tickets',
    () => void queryClient.invalidateQueries({ queryKey: orpc.tickets.key() }),
  );

  const query = useInfiniteQuery(
    orpc.tickets.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ ...params, sort, ascending, cursor }),
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

/** One ticket: every slot of its panel reads this query. */
export const useTicket = (id: string) => useQuery(orpc.tickets.get.queryOptions({ input: { id } }));

/** The pipelines and statuses of the member's channels: what a ticket is filed under. */
export const useChoices = () => {
  const { data } = useQuery(orpc.pipelines.choices.queryOptions());

  return { pipelines: data?.pipelines ?? [], statuses: data?.statuses ?? [] };
};

/** Refetches every ticket query after a change, and shows a refusal. */
export const useTicketChange = () => useChange(orpc.tickets.key());

/** Saves the given fields of one ticket, or moves it to another status of its pipeline. */
export const useEditTicket = (id: string) => {
  const update = useMutation(orpc.tickets.update.mutationOptions(useTicketChange()));

  return (change: TicketChange) => update.mutate({ id, ...change });
};

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
      onSuccess: async ({ ids }) => {
        toast({
          title: t('tickets-deleted', {
            defaultValue_one: 'Ticket deleted',
            defaultValue_other: '{{count}} tickets deleted',
            count: ids.length,
          }),
        });
        await change.onSuccess();
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
