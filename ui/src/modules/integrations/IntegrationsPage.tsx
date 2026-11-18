import {
  IconCalendarCheck,
  IconCircles,
  IconHeartbeat,
  IconLetterCase,
  IconPlugConnected,
  IconRefresh,
  IconRobot,
  IconTrash,
} from '@tabler/icons-react';
import {
  Button,
  PageContainer,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  useOpenRecord,
} from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { ACCOUNT_TYPE, INTEGRATION_TYPE, META_BOT_TYPE } from '~/plugin.ts';
import { AppHeader } from '~/shared/Header.tsx';
import { KindIcon } from '~/shared/kinds.tsx';
import { AccountChannels } from './AccountChannels.tsx';
import { ListEmpty } from '~/shared/List.tsx';
import { RowActions, TextCell } from '~/shared/Records.tsx';
import { DateCell, Rows } from '~/shared/Table.tsx';
import { ConnectMenu } from './ConnectMenu.tsx';
import { StatusBadge } from './parts.tsx';
import {
  type Account,
  type Bot,
  isMeta,
  useAccounts,
  useBots,
  useRepairAccount,
  useProviderNames,
  useRemoveAccount,
} from './useIntegrations.ts';

type Row = Account & { bot: Bot | undefined };

const MoreCell = ({ row }: { row: Row }) => {
  const { t } = useTranslation('frontline');
  const { open, openNew } = useOpenRecord();
  const repair = useRepairAccount();
  const remove = useRemoveAccount();

  const bot = isMeta(row)
    ? row.bot
      ? [
          {
            value: 'bot',
            icon: <IconRobot />,
            label: t('open-bot', 'Open bot'),
            onSelect: () => open({ contentType: META_BOT_TYPE, contentId: row.bot?.id ?? '' }),
          },
        ]
      : [
          {
            value: 'bot',
            icon: <IconRobot />,
            label: t('set-up-bot', 'Set up a bot'),
            onSelect: () => openNew(META_BOT_TYPE, { accountId: row.id }),
          },
        ]
    : [];

  return (
    <RowActions
      label={t('account-actions', 'Actions for {{name}}', { name: row.name })}
      actions={[
        {
          value: 'channel',
          icon: <IconCircles />,
          label: t('add-to-channel', 'Add to a channel'),
          onSelect: () =>
            openNew(INTEGRATION_TYPE, { kind: row.provider, accountId: row.id, name: row.name }),
        },
        ...bot,
        {
          value: 'repair',
          icon: <IconRefresh />,
          label: t('repair', 'Repair'),
          onSelect: () => repair.mutate({ id: row.id }),
        },
        {
          value: 'remove',
          icon: <IconTrash />,
          label: t('disconnect', 'Disconnect'),
          onSelect: () => void remove(row),
        },
      ]}
    />
  );
};

/**
 * A cell that opens the record `contentType` with its `icon` and `label`, or reads empty without
 * one.
 */
const OpenCell = ({
  label,
  icon,
  contentType,
  contentId,
}: {
  label: string | undefined;
  icon?: ReactNode;
  contentType: string;
  contentId: string;
}) => {
  const { open } = useOpenRecord();

  if (!label) return <TextCell value={null} />;

  return (
    <RecordTableInlineCell>
      <Button
        variant="ghost"
        className="w-full justify-start"
        onClick={() => open({ contentType, contentId })}
      >
        {icon}
        <span className="truncate">{label}</span>
      </Button>
    </RecordTableInlineCell>
  );
};

const useColumns = (): RecordTableColumnDef<Row>[] => {
  const { t } = useTranslation('frontline');
  const names = useProviderNames();

  return [
    {
      id: 'more',
      header: () => <RecordTable.ColumnSelector />,
      cell: ({ row }) => <MoreCell row={row.original} />,
      size: 33,
    },
    {
      id: 'name',
      header: () => <RecordTable.InlineHead label={t('name', 'Name')} icon={IconLetterCase} />,
      cell: ({ row }) => (
        <OpenCell
          label={row.original.name}
          icon={<KindIcon kind={row.original.provider} />}
          contentType={ACCOUNT_TYPE}
          contentId={row.original.id}
        />
      ),
      size: 240,
    },
    {
      id: 'provider',
      header: () => <RecordTable.InlineHead label={t('type', 'Type')} icon={IconPlugConnected} />,
      cell: ({ row }) => <TextCell value={names[row.original.provider]} />,
      size: 170,
    },
    {
      id: 'channels',
      header: () => <RecordTable.InlineHead label={t('channels', 'Channels')} icon={IconCircles} />,
      cell: ({ row }) => <AccountChannels accountId={row.original.id} />,
      size: 260,
    },
    {
      id: 'status',
      header: () => <RecordTable.InlineHead label={t('status', 'Status')} icon={IconHeartbeat} />,
      cell: ({ row }) => (
        <RecordTableInlineCell title={row.original.error ?? undefined}>
          <StatusBadge status={row.original.status} />
        </RecordTableInlineCell>
      ),
      size: 130,
    },
    {
      id: 'bot',
      header: () => <RecordTable.InlineHead label={t('bot', 'Bot')} icon={IconRobot} />,
      cell: ({ row }) => (
        <OpenCell
          label={row.original.bot?.name}
          contentType={META_BOT_TYPE}
          contentId={row.original.bot?.id ?? ''}
        />
      ),
      size: 200,
    },
    {
      id: 'checkedAt',
      header: () => (
        <RecordTable.InlineHead label={t('checked-at', 'Checked at')} icon={IconCalendarCheck} />
      ),
      cell: ({ row }) =>
        row.original.checkedAt ? (
          <DateCell date={row.original.checkedAt} />
        ) : (
          <TextCell value={null} />
        ),
      size: 140,
    },
  ];
};

/** What Meta's login reported when it sent the member back here. */
const LoginResult = () => {
  const { t } = useTranslation('frontline');
  const [params] = useSearchParams();
  const error = params.get('error');
  const connected = params.get('connected');

  if (error)
    return (
      <p role="alert" className="mx-3 mt-3 text-sm text-destructive-text">
        {error}
      </p>
    );

  if (connected === null) return null;

  return (
    <output className="mx-3 mt-3 block text-sm text-muted-foreground">
      {t('pages-connected', {
        defaultValue_one: 'Connected {{count}} page',
        defaultValue_other: 'Connected {{count}} pages',
        count: Number(connected),
      })}
    </output>
  );
};

/**
 * Every account the organisation connected: Facebook pages and Instagram accounts with the bot
 * each runs, Telegram and Discord bots, mailboxes and phone lines. A name opens the account; a
 * row's menu adds it to a channel, sets up a page's bot, repairs it or disconnects it.
 */
export const IntegrationsPage = () => {
  const { t } = useTranslation('frontline');
  const accounts = useAccounts();
  const bots = useBots();
  const columns = useColumns();

  const rows = (accounts.data?.accounts ?? []).map((account) => ({
    ...account,
    bot: bots.data?.find((bot) => bot.accountId === account.id),
  }));

  return (
    <PageContainer>
      <AppHeader icon={IconPlugConnected} app={{ label: t('integrations', 'Integrations') }}>
        <ConnectMenu />
      </AppHeader>
      <LoginResult />
      {accounts.error ? (
        <p role="alert" className="m-3 text-sm text-destructive-text">
          {accounts.error.message}
        </p>
      ) : !accounts.isPending && rows.length === 0 ? (
        <ListEmpty
          icon={<IconPlugConnected />}
          title={t('no-accounts-connected', 'No accounts connected')}
          description={t(
            'connect-accounts-description',
            'Connect your pages, bots, mailboxes and phone lines to answer them in the inbox',
          )}
        />
      ) : (
        <RecordTable.Provider
          tableId="frontline_integration_accounts"
          columns={columns}
          data={rows}
          stickyColumns={['more', 'name']}
          className="m-3"
        >
          <Rows isPending={accounts.isPending} skeletons={3} />
        </RecordTable.Provider>
      )}
    </PageContainer>
  );
};
