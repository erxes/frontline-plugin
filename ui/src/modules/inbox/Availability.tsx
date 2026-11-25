import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, cn } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';

/**
 * Whether the member takes conversations now, toggled in place: away, they get none from the
 * channels' auto-assignment or reassignment, and an away message answers when everyone is.
 */
export const AvailabilityToggle = () => {
  const { t } = useTranslation('frontline');
  const queryClient = useQueryClient();
  const mine = useQuery(orpc.availability.mine.queryOptions({ input: {} }));

  const set = useMutation(
    orpc.availability.set.mutationOptions({
      onSuccess: (saved) => {
        queryClient.setQueryData(orpc.availability.mine.queryKey({ input: {} }), saved);
        void queryClient.invalidateQueries({ queryKey: orpc.availability.away.key() });
      },
    }),
  );

  if (!mine.data) return null;

  const available = mine.data.status === 'available';

  return (
    <Button
      variant="outline"
      aria-pressed={available}
      disabled={set.isPending}
      title={
        available
          ? t('availability-hint-available', 'You get new conversations. Click to go away.')
          : t('availability-hint-away', 'You get no new conversations. Click to come back.')
      }
      onClick={() => set.mutate({ status: available ? 'away' : 'available' })}
    >
      <span
        aria-hidden
        className={cn('size-2 rounded-full', available ? 'bg-success' : 'bg-muted-foreground')}
      />
      {available ? t('status-available', 'Available') : t('status-away', 'Away')}
    </Button>
  );
};
