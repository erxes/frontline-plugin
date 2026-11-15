import { IconBrandTrello } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { ListEmpty, SearchSubHeader } from '~/shared/List.tsx';
import { ChannelsTable } from './ChannelsTable.tsx';
import { useChannels } from './useChannels.ts';

/** The channels the member works in, by name, with search and bulk delete. */
export const ChannelsPage = () => {
  const { t } = useTranslation('frontline');
  const { data, isPending, error } = useChannels();
  const channels = data?.channels ?? [];

  return (
    <>
      <SearchSubHeader id="channels-filter" count={data?.channels.length} />
      {error ? (
        <p className="m-3 text-sm text-destructive-text">{error.message}</p>
      ) : !isPending && channels.length === 0 ? (
        <ListEmpty
          icon={<IconBrandTrello />}
          title={t('no-channels-found', 'No channels found')}
          description={t(
            'no-channels-description',
            'Create a channel to start organizing your team.',
          )}
        />
      ) : (
        <ChannelsTable channels={channels} isPending={isPending} />
      )}
    </>
  );
};
