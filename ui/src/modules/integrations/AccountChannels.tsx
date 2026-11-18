import { useQuery } from '@tanstack/react-query';
import { Button, RecordTableInlineCell, useOpenRecord } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { CHANNEL_TYPE } from '~/plugin.ts';
import { ChannelLabel } from '~/shared/ChannelSelect.tsx';
import { channelsQuery, integrationsQuery } from '~/shared/reference.ts';

/** The ids of the channels each connected account's conversations land in. */
const useChannelsByAccount = () => {
  const integrations = useQuery(integrationsQuery).data ?? [];
  const byAccount = new Map<string, string[]>();

  for (const { config, channelId } of integrations) {
    if (typeof config.accountId !== 'string') continue;

    byAccount.set(config.accountId, [...(byAccount.get(config.accountId) ?? []), channelId]);
  }

  return byAccount;
};

/**
 * The list's Channels cell: each channel the account's conversations land in, by its icon and
 * name, opening it in the side panel. An account in none says so, since it takes no conversations.
 */
export const AccountChannels = ({ accountId }: { accountId: string }) => {
  const { t } = useTranslation('frontline');
  const { open } = useOpenRecord();
  const ids = useChannelsByAccount().get(accountId) ?? [];

  const channels = (useQuery(channelsQuery).data?.channels ?? []).filter(({ id }) =>
    ids.includes(id),
  );

  return (
    <RecordTableInlineCell>
      {channels.length === 0 ? (
        <span className="px-2 text-xs text-muted-foreground">
          {t('in-no-channel', 'In no channel yet')}
        </span>
      ) : (
        <span className="flex min-w-0 gap-1">
          {channels.map((channel) => (
            <Button
              key={channel.id}
              variant="outline"
              size="sm"
              onClick={() => open({ contentType: CHANNEL_TYPE, contentId: channel.id })}
            >
              <ChannelLabel id={channel.id} />
            </Button>
          ))}
        </span>
      )}
    </RecordTableInlineCell>
  );
};
