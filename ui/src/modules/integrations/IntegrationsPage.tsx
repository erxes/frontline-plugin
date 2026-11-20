import {
  IconCalendarPlus,
  IconCircles,
  IconHeartbeat,
  IconLetterCase,
  IconMessageCirclePlus,
  IconPlugConnected,
  IconSettings,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  ListFilter,
  PageContainer,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  type TListFilterField,
  useListFilterParams,
  useOpenRecord,
  ViewBar,
} from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { Integration } from '@/inbox/queries.ts';
import { messengerPath } from '@/messenger/queries.ts';
import { orpc } from '~/orpc.ts';
import { CHANNEL_TYPE, INTEGRATION_TYPE } from '~/plugin.ts';
import { ChannelLabel } from '~/shared/ChannelSelect.tsx';
import { AppHeader } from '~/shared/Header.tsx';
import { KindIcon, useKindNames } from '~/shared/kinds.tsx';
import { ListEmpty } from '~/shared/List.tsx';
import { RowActions, TextCell } from '~/shared/Records.tsx';
import { channelsQuery } from '~/shared/reference.ts';
import { column as columnOf, DateCell, Rows } from '~/shared/Table.tsx';
import { ConnectMenu, useCanConnect } from './ConnectMenu.tsx';

const column = columnOf<Integration>;

/** A messenger's settings page; the rest open in the side panel. */
const MoreCell = ({ integration }: { integration: Integration }) => {
  const { t } = useTranslation('frontline');
  const { open } = useOpenRecord();
  const navigate = useNavigate();

  return (
    <RowActions
      label={t('integration-actions-of', 'Actions for {{name}}', { name: integration.name })}
      actions={[
        {
          value: 'open',
          icon: <IconPlugConnected />,
          label: t('open', 'Open'),
          onSelect: () => open({ contentType: INTEGRATION_TYPE, contentId: integration.id }),
        },
        ...(integration.kind === 'messenger'
          ? [
              {
                value: 'settings',
                icon: <IconSettings />,
                label: t('messenger-settings', 'Messenger settings'),
                onSelect: () => void navigate(messengerPath(integration.id)),
              },
            ]
          : []),
      ]}
    />
  );
};

/** A cell that opens a record in the side panel, showing `children`. */
const OpenCell = ({
  contentType,
  contentId,
  children,
}: {
  contentType: string;
  contentId: string;
  children: ReactNode;
}) => {
  const { open } = useOpenRecord();

  return (
    <RecordTableInlineCell>
      <Button
        variant="ghost"
        className="w-full justify-start"
        onClick={() => open({ contentType, contentId })}
      >
        {children}
      </Button>
    </RecordTableInlineCell>
  );
};

const useColumns = (): RecordTableColumnDef<Integration>[] => {
  const { t } = useTranslation('frontline');
  const kinds = useKindNames();

  return [
    {
      id: 'more',
      header: () => <RecordTable.ColumnSelector />,
      cell: ({ row }) => <MoreCell integration={row.original} />,
      size: 33,
    },
    column('name', t('name', 'Name'), IconLetterCase, 240, (integration) => (
      <OpenCell contentType={INTEGRATION_TYPE} contentId={integration.id}>
        <KindIcon kind={integration.kind} />
        <span className="truncate">{integration.name}</span>
      </OpenCell>
    )),
    column('kind', t('type', 'Type'), IconPlugConnected, 170, (integration) => (
      <TextCell value={kinds[integration.kind] ?? integration.kind} />
    )),
    column('channel', t('channel', 'Channel'), IconCircles, 220, (integration) => (
      <OpenCell contentType={CHANNEL_TYPE} contentId={integration.channelId}>
        <ChannelLabel id={integration.channelId} />
      </OpenCell>
    )),
    column('isActive', t('status', 'Status'), IconHeartbeat, 120, (integration) => (
      <RecordTableInlineCell>
        <Badge variant={integration.isActive ? 'success' : 'secondary'}>
          {integration.isActive ? t('active', 'Active') : t('archived', 'Archived')}
        </Badge>
      </RecordTableInlineCell>
    )),
    column('createdAt', t('created-at', 'Created at'), IconCalendarPlus, 130, (integration) => (
      <DateCell date={integration.createdAt} />
    )),
  ];
};

/** What the filter bar narrows integrations by; the API applies it. */
const useFields = (): TListFilterField[] => {
  const { t } = useTranslation('frontline');
  const kinds = useKindNames();
  const channels = useQuery(channelsQuery).data?.channels ?? [];

  return [
    { path: 'subject.name', label: t('name', 'Name'), type: 'text', icon: IconLetterCase },
    {
      path: 'subject.kind',
      label: t('type', 'Type'),
      type: 'select',
      icon: IconPlugConnected,
      options: Object.entries(kinds).map(([value, label]) => ({ value, label })),
    },
    {
      path: 'subject.channelId',
      label: t('channel', 'Channel'),
      type: 'select',
      icon: IconCircles,
      options: channels.map((channel) => ({ value: channel.id, label: channel.name })),
    },
    {
      path: 'subject.isActive',
      label: t('active', 'Active'),
      type: 'boolean',
      icon: IconHeartbeat,
    },
    {
      path: 'subject.createdAt',
      label: t('created-at', 'Created at'),
      type: 'date',
      icon: IconCalendarPlus,
    },
  ];
};

/**
 * Settings › Integrations: every way conversations come into the member's channels, website
 * messengers and connected pages, bots, mailboxes and phone lines alike, each with the channel it
 * feeds. A name opens the integration in the side panel; its channel opens the channel. The
 * accounts behind them are Settings › Connected accounts.
 */
export const IntegrationsPage = () => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const canConnect = useCanConnect();
  const params = useListFilterParams();
  const list = useQuery(orpc.integrations.list.queryOptions({ input: params }));
  const rows = list.data ?? [];
  const columns = useColumns();

  return (
    <PageContainer>
      <AppHeader icon={IconPlugConnected} app={{ label: t('integrations', 'Integrations') }}>
        {canConnect ? (
          <ConnectMenu withMessenger />
        ) : (
          <Button onClick={() => openNew(INTEGRATION_TYPE)}>
            <IconMessageCirclePlus />
            {t('add-messenger', 'Add messenger')}
          </Button>
        )}
      </AppHeader>
      <ViewBar allLabel={t('all-integrations', 'All integrations')}>
        <ListFilter
          id="frontline-integrations"
          fields={useFields()}
          totalCount={list.isPending ? undefined : rows.length}
        />
      </ViewBar>
      {list.error ? (
        <p role="alert" className="m-3 text-sm text-destructive-text">
          {list.error.message}
        </p>
      ) : !list.isPending && rows.length === 0 ? (
        <ListEmpty
          icon={<IconPlugConnected />}
          title={t('no-integrations-yet', 'No integrations yet')}
          description={t(
            'integrations-description',
            'Add a website messenger or connect a page, bot, mailbox or phone line to a channel.',
          )}
        />
      ) : (
        <RecordTable.Provider
          tableId="frontline_integrations"
          columns={columns}
          data={rows}
          stickyColumns={['more', 'name']}
          className="m-3"
        >
          <Rows isPending={list.isPending} skeletons={4} />
        </RecordTable.Provider>
      )}
    </PageContainer>
  );
};
