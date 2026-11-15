import {
  IconBrandFacebook,
  IconCalendarCheck,
  IconCircles,
  IconHeartbeat,
  IconLetterCase,
  IconPlugConnected,
  IconRefresh,
  IconRobot,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  Badge,
  Button,
  PageContainer,
  PageHeader,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  useOpenRecord,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { orpc } from '~/orpc.ts';
import { INTEGRATION_TYPE, META_BOT_TYPE } from '~/plugin.ts';
import { ListEmpty } from '~/shared/List.tsx';
import { RowActions, TextCell } from '~/shared/Records.tsx';
import { DateCell, Rows } from '~/shared/Table.tsx';
import {
  type Account,
  type Bot,
  useBots,
  useConnect,
  useIntegrationChange,
  useMetaAccounts,
  useRemoveAccount,
} from './useMeta.ts';

type Row = Account & { bot: Bot | undefined };

const MoreCell = ({ row }: { row: Row }) => {
  const { t } = useTranslation('frontline');
  const { open, openNew } = useOpenRecord();

  const check = useMutation(
    orpc.integrations.accounts.check.mutationOptions(useIntegrationChange()),
  );

  const remove = useRemoveAccount();

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
              onSelect: () => openNew(META_BOT_TYPE, { accountId: row.id }),
            },
        {
          value: 'check',
          icon: <IconRefresh />,
          label: t('check-connection', 'Check connection'),
          onSelect: () => check.mutate({ id: row.id }),
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

const BotCell = ({ bot }: { bot: Bot | undefined }) => {
  const { open } = useOpenRecord();

  if (!bot) return <TextCell value={null} />;

  return (
    <RecordTableInlineCell>
      <Button
        variant="ghost"
        className="w-full justify-start"
        onClick={() => open({ contentType: META_BOT_TYPE, contentId: bot.id })}
      >
        {bot.name}
      </Button>
    </RecordTableInlineCell>
  );
};

const useColumns = (): RecordTableColumnDef<Row>[] => {
  const { t } = useTranslation('frontline');

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
      cell: ({ row }) => <TextCell value={row.original.name} />,
      size: 240,
    },
    {
      id: 'provider',
      header: () => <RecordTable.InlineHead label={t('type', 'Type')} icon={IconBrandFacebook} />,
      cell: ({ row }) => (
        <TextCell
          value={
            row.original.provider === 'instagram'
              ? t('instagram-account', 'Instagram account')
              : t('facebook-page', 'Facebook page')
          }
        />
      ),
      size: 170,
    },
    {
      id: 'status',
      header: () => <RecordTable.InlineHead label={t('status', 'Status')} icon={IconHeartbeat} />,
      cell: ({ row }) => (
        <RecordTableInlineCell title={row.original.error ?? undefined}>
          <Badge variant={row.original.status === 'healthy' ? 'success' : 'destructive'}>
            {row.original.status === 'healthy' ? t('working', 'Working') : t('broken', 'Broken')}
          </Badge>
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
 * The Facebook pages and Instagram accounts the organisation connected through Meta's login, with
 * the bot each one runs. A row's menu adds it to a channel, sets up its bot, checks it or
 * disconnects it.
 */
export const MetaPage = () => {
  const { t } = useTranslation('frontline');
  const accounts = useMetaAccounts();
  const bots = useBots();
  const connect = useConnect();
  const columns = useColumns();

  const rows = (accounts.data ?? []).map((account) => ({
    ...account,
    bot: bots.data?.find((bot) => bot.accountId === account.id),
  }));

  const connectButton = (variant: 'default' | 'secondary') => (
    <Button variant={variant} disabled={connect.isPending} onClick={() => connect.mutate({})}>
      <IconPlugConnected />
      {t('connect-facebook', 'Connect Facebook')}
    </Button>
  );

  return (
    <PageContainer>
      <PageHeader>
        <PageHeader.Start>
          <span className="flex h-8 items-center gap-1.5 px-3 text-sm font-medium">
            <IconBrandFacebook />
            {t('facebook-and-instagram', 'Facebook and Instagram')}
          </span>
        </PageHeader.Start>
        <PageHeader.End>{connectButton('default')}</PageHeader.End>
      </PageHeader>
      <LoginResult />
      {accounts.error ? (
        <p role="alert" className="m-3 text-sm text-destructive-text">
          {accounts.error.message}
        </p>
      ) : !accounts.isPending && rows.length === 0 ? (
        <ListEmpty
          icon={<IconBrandFacebook />}
          title={t('no-pages-connected', 'No pages connected')}
          description={t(
            'connect-pages-description',
            'Connect your Facebook pages and their Instagram accounts to answer messages and comments in the inbox',
          )}
          action={connectButton('secondary')}
        />
      ) : (
        <RecordTable.Provider
          tableId="frontline_meta_accounts"
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
