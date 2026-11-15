import { useMutation } from '@tanstack/react-query';
import { toast } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useChannels } from '../channels/useChannels.ts';
import { orpc } from '../orpc.ts';
import { useConfirmDelete } from '../shared/Records.tsx';
import { type Ticket, useTicketChange } from './useTickets.ts';

/** Whether the member may delete the ticket: its channel's admins and channel managers may. */
export const useCanDelete = () => {
  const channels = useChannels().data?.channels ?? [];

  return (ticket: Pick<Ticket, 'channelId'>) =>
    channels.some((channel) => channel.id === ticket.channelId && channel.canManage);
};

/** Asks for "delete" to be typed, then deletes the tickets in one request; `onDeleted` runs after. */
export const useDeleteTickets = () => {
  const { t } = useTranslation('frontline');
  const confirm = useConfirmDelete();
  const change = useTicketChange();
  const remove = useMutation(orpc.tickets.bulkRemove.mutationOptions(change));

  const deleteTickets = async (ids: string[], onDeleted?: () => void) => {
    await confirm(
      ids.length === 1
        ? t('confirm-delete-ticket', 'Are you sure you want to delete this ticket?')
        : t('confirm-delete-tickets', {
            defaultValue: 'Are you sure you want to delete the {{count}} selected tickets?',
            count: ids.length,
          }),
    );

    remove.mutate(
      { ids },
      {
        onSuccess: () => {
          toast({ title: t('ticket-deleted-successfully', 'Ticket deleted successfully') });
          onDeleted?.();
        },
      },
    );
  };

  return { deleteTickets, isPending: remove.isPending };
};
