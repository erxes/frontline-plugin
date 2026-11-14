import { IconBrandTrello, IconSearchOff } from '@tabler/icons-react';
import { Combobox, Command, Empty, Filter, PageSubHeader } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { ChannelsTable } from './ChannelsTable.tsx';
import { SEARCH_KEY, useChannels } from './useChannels.ts';

/** Search by name, and how many channels match. */
const ChannelsSubHeader = ({ count }: { count: number | undefined }) => {
  const { t } = useTranslation('frontline');

  return (
    <Filter id="channels-filter">
      <PageSubHeader>
        <Filter.Bar>
          <Filter.Popover scope="channels-settings-page">
            <Filter.Trigger />
            <Combobox.Content>
              <Filter.View>
                <Command>
                  <Filter.CommandInput placeholder={t('filter', 'Filter...')} variant="secondary" />
                  <Command.List>
                    <Filter.SearchValueTrigger />
                  </Command.List>
                </Command>
              </Filter.View>
            </Combobox.Content>
          </Filter.Popover>
          <Filter.Dialog>
            <Filter.View filterKey={SEARCH_KEY} inDialog>
              <Filter.DialogStringView filterKey={SEARCH_KEY} />
            </Filter.View>
          </Filter.Dialog>
          <Filter.SearchValueBarItem />
          {count !== undefined && (
            <span className="text-muted-foreground text-sm font-medium whitespace-nowrap">
              {t('channels-found', { defaultValue: '{{count}} records found', count })}
            </span>
          )}
        </Filter.Bar>
      </PageSubHeader>
    </Filter>
  );
};

/** The channels the member works in, by name, with search and bulk delete. */
export const ChannelsPage = () => {
  const { t } = useTranslation('frontline');
  const { search, data, isPending, error } = useChannels();
  const channels = data?.channels ?? [];

  return (
    <>
      <ChannelsSubHeader count={data?.channels.length} />
      {error ? (
        <p className="m-3 text-sm text-destructive-text">{error.message}</p>
      ) : !isPending && channels.length === 0 ? (
        <Empty variant="outline" className="m-3">
          <Empty.Header>
            <Empty.Media>{search ? <IconSearchOff /> : <IconBrandTrello />}</Empty.Media>
            <Empty.Title>
              {search
                ? t('no-results-found', 'No results found')
                : t('no-channels-found', 'No channels found')}
            </Empty.Title>
            <Empty.Description>
              {search
                ? t('try-different-search-term', 'Try a different search term')
                : t('no-channels-description', 'Create a channel to start organizing your team.')}
            </Empty.Description>
          </Empty.Header>
        </Empty>
      ) : (
        <ChannelsTable channels={channels} isPending={isPending} />
      )}
    </>
  );
};
