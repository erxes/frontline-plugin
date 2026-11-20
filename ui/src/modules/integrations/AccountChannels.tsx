import { useQuery } from '@tanstack/react-query';
import { Button, RecordTableInlineCell, useOpenRecord } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { INTEGRATION_TYPE } from '~/plugin.ts';
import { ChannelLabel } from '~/shared/ChannelSelect.tsx';
import { integrationsQuery } from '~/shared/reference.ts';

/**
 * The list's Channels cell: each channel the account's conversations land in, by its icon and
 * name, opening that integration in the side panel to rename, archive, move or delete it, as the
 * old integration rows' menu did. An account in none says so, since it takes no conversations.
 */
export const AccountChannels = ({ accountId }: { accountId: string }) => {
  const { t } = useTranslation('frontline');
  const { open } = useOpenRecord();

  const integrations = (useQuery(integrationsQuery).data ?? []).filter(
    ({ config }) => (config.accountId ?? config.connectionId) === accountId,
  );

  return (
    <RecordTableInlineCell>
      {integrations.length === 0 ? (
        <span className="px-2 text-xs text-muted-foreground">
          {t('in-no-channel', 'In no channel yet')}
        </span>
      ) : (
        <span className="flex min-w-0 gap-1">
          {integrations.map((integration) => (
            <Button
              key={integration.id}
              variant="outline"
              size="sm"
              onClick={() => open({ contentType: INTEGRATION_TYPE, contentId: integration.id })}
            >
              <ChannelLabel id={integration.channelId} />
              {!integration.isActive && (
                <span className="text-muted-foreground">{t('archived', 'Archived')}</span>
              )}
            </Button>
          ))}
        </span>
      )}
    </RecordTableInlineCell>
  );
};
