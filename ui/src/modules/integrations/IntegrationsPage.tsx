import {
  IconCalendarCheck,
  IconCircles,
  IconHeartbeat,
  IconLetterCase,
  IconPlugConnected,
  IconRefresh,
  IconRobot,
  IconSettings,
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
import { useNavigate } from 'react-router-dom';
import { ACCOUNT_TYPE, INTEGRATION_TYPE, META_BOT_TYPE } from '~/plugin.ts';
import { AppHeader } from '~/shared/Header.tsx';
import { KindIcon } from '~/shared/kinds.tsx';
import { AccountChannels } from './AccountChannels.tsx';
import { ListEmpty } from '~/shared/List.tsx';
import { RowActions, TextCell } from '~/shared/Records.tsx';
import { DateCell, Rows } from '~/shared/Table.tsx';
import { ConnectMenu, useCanConnect } from './ConnectMenu.tsx';
import { StatusBadge } from './parts.tsx';
import {
  type Account,
  type Bot,
  META_SETTINGS,
  type MetaConnection,
  useAccounts,
  useBots,
  useMetaConnections,
  useRepairAccount,
  useProviderNames,
  useRemoveAccount,
} from './useIntegrations.ts';

type Row = {
  id: string;
  name: string;
  kind: Account['provider'] | MetaConnection['kind'];
  status: Account['status'];
  error: string | null;
  checkedAt: Date | null;
  bot: Bot | undefined;
  meta: boolean;
};

const useAccountActions = (row: Row) => {
  const repair = useRepairAccount();
  const remove = useRemoveAccount();
  const { t } = useTranslation('frontline');

  return [
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
  ];
};

const MoreCell = ({ row }: { row: Row }) => {
  const { t } = useTranslation('frontline');
  const { open, openNew } = useOpenRecord();
  const navigate = useNavigate();
  const accountActions = useAccountActions(row);

  const metaActions = [
    row.bot
      ? {
          value: 'bot',
          icon: <IconRobot />,
          label: t('open-bot', 'Open bot'),
          onSelect: () => open({ contentType: META_BOT_TYPE, contentId: row.bot?.id ?? '' }),
        }
      : {
          value: 'bot',
          icon: <IconRobot />,
          label: t('set-up-bot', 'Set up a bot'),
          onSelect: () => openNew(META_BOT_TYPE, { connectionId: row.id }),
        },
    {
      value: 'settings',
      icon: <IconSettings />,
      label: t('manage-in-settings', 'Manage in Settings'),
      onSelect: () => void navigate(META_SETTINGS),
    },
  ];

  return (
    <RowActions
      label={t('account-actions', 'Actions for {{name}}', { name: row.name })}
      actions={[
        {
          value: 'channel',
          icon: <IconCircles />,
          label: t('add-to-channel', 'Add to a channel'),
          onSelect: () =>
            openNew(INTEGRATION_TYPE, {
              kind: row.kind,
              name: row.name,
              ...(row.meta ? { connectionId: row.id } : { accountId: row.id }),
            }),
        },
        ...(row.meta ? metaActions : accountActions),
      ]}
    />
  );
};

const OpenCell = ({
  label,
  icon,
  onOpen,
}: {
  label: string | undefined;
  icon?: ReactNode;
  onOpen: () => void;
}) => {
  if (!label) return <TextCell value={null} />;

  return (
    <RecordTableInlineCell>
      <Button variant="ghost" className="w-full justify-start" onClick={onOpen}>
        {icon}
        <span className="truncate">{label}</span>
      </Button>
    </RecordTableInlineCell>
  );
};

const NameCell = ({ row }: { row: Row }) => {
  const { open } = useOpenRecord();
  const navigate = useNavigate();

  return (
    <OpenCell
      label={row.name}
      icon={<KindIcon kind={row.kind} />}
      onOpen={() =>
        row.meta
          ? void navigate(META_SETTINGS)
          : open({ contentType: ACCOUNT_TYPE, contentId: row.id })
      }
    />
  );
};

const BotCell = ({ bot }: { bot: Bot | undefined }) => {
  const { open } = useOpenRecord();

  return (
    <OpenCell
      label={bot?.name}
      onOpen={() => open({ contentType: META_BOT_TYPE, contentId: bot?.id ?? '' })}
    />
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
      cell: ({ row }) => <NameCell row={row.original} />,
      size: 240,
    },
    {
      id: 'provider',
      header: () => <RecordTable.InlineHead label={t('type', 'Type')} icon={IconPlugConnected} />,
      cell: ({ row }) => <TextCell value={names[row.original.kind]} />,
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
      cell: ({ row }) => <BotCell bot={row.original.bot} />,
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

/**
 * Every account the organisation connected: Facebook pages and Instagram accounts, which core
 * connects, with the bot each runs, then Telegram and Discord bots, mailboxes and phone lines. A
 * name opens the account, or core's settings for a page; a row's menu adds it to a channel, sets
 * up a page's bot, repairs an account or disconnects it.
 */
export const IntegrationsPage = () => {
  const { t } = useTranslation('frontline');
  const accounts = useAccounts();
  const connections = useMetaConnections();
  const bots = useBots();
  const columns = useColumns();
  const canConnect = useCanConnect();

  const rows: Row[] = [
    ...(connections.data ?? []).map((connection) => ({
      id: connection.id,
      name: connection.name,
      kind: connection.kind,
      status: connection.status,
      error: connection.statusReason,
      checkedAt: connection.checkedAt ? new Date(connection.checkedAt) : null,
      bot: bots.data?.find((bot) => bot.connectionId === connection.id),
      meta: true,
    })),
    ...(accounts.data?.accounts ?? []).map((account) => ({
      id: account.id,
      name: account.name,
      kind: account.provider,
      status: account.status,
      error: account.error,
      checkedAt: account.checkedAt,
      bot: undefined,
      meta: false,
    })),
  ];

  const isPending = accounts.isPending || connections.isPending;

  return (
    <PageContainer>
      <AppHeader icon={IconPlugConnected} app={{ label: t('integrations', 'Integrations') }}>
        {canConnect && <ConnectMenu />}
      </AppHeader>
      {accounts.error ? (
        <p role="alert" className="m-3 text-sm text-destructive-text">
          {accounts.error.message}
        </p>
      ) : !isPending && rows.length === 0 ? (
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
          <Rows isPending={isPending} skeletons={3} />
        </RecordTable.Provider>
      )}
    </PageContainer>
  );
};
