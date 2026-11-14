import { IconMessages, IconPlus } from '@tabler/icons-react';
import {
  Button,
  Empty,
  PageContainer,
  PageHeader,
  RecordTable,
  type RecordTableColumnDef,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { ChannelSheet } from './ChannelSheet.tsx';
import { type Channel, useChannels, useOpenChannel, useRoleNames } from './useChannels.ts';

const NameCell = ({ channel }: { channel: Channel }) => {
  const { open } = useOpenChannel();

  return (
    <Button variant="ghost" className="w-full justify-start" onClick={() => open(channel.id)}>
      {channel.name}
    </Button>
  );
};

const RoleCell = ({ channel }: { channel: Channel }) => {
  const roles = useRoleNames();

  return <span className="px-2">{channel.role ? roles[channel.role] : '-'}</span>;
};

/** Where RecordTable keeps this list's column settings. */
const TABLE_ID = 'frontline_channels';

const columns: RecordTableColumnDef<Channel>[] = [
  { id: 'name', header: 'Name', size: 240, cell: ({ row }) => <NameCell channel={row.original} /> },
  {
    id: 'description',
    header: 'Description',
    size: 360,
    cell: ({ row }) => <span className="truncate px-2">{row.original.description}</span>,
  },
  {
    id: 'members',
    header: 'Members',
    size: 120,
    cell: ({ row }) => <span className="px-2 tabular-nums">{row.original.memberCount}</span>,
  },
  {
    id: 'role',
    header: 'Your role',
    size: 140,
    cell: ({ row }) => <RoleCell channel={row.original} />,
  },
];

/** The channels the member works in, by name; each opens in the side panel. */
export const ChannelsPage = () => {
  const { t } = useTranslation('frontline');
  const { open } = useOpenChannel();
  const { data, isPending, error } = useChannels();
  const list = data?.channels ?? [];

  return (
    <PageContainer>
      <PageHeader>
        <PageHeader.Start>
          <IconMessages />
          <h1 className="text-sm font-semibold">{t('channels', 'Channels')}</h1>
        </PageHeader.Start>
        <PageHeader.End>
          {data?.canCreate && (
            <Button onClick={() => open('new')}>
              <IconPlus />
              {t('add-channel', 'Add channel')}
            </Button>
          )}
        </PageHeader.End>
      </PageHeader>
      {error ? (
        <p className="m-3 text-sm text-destructive-text">{error.message}</p>
      ) : (
        <RecordTable.Provider columns={columns} data={list} className="m-3" tableId={TABLE_ID}>
          <RecordTable>
            <RecordTable.Header />
            <RecordTable.Body>
              {isPending ? <RecordTable.RowSkeleton rows={6} /> : <RecordTable.RowList />}
            </RecordTable.Body>
          </RecordTable>
          {!isPending && !list.length && (
            <Empty className="absolute inset-x-0 top-1/4">
              <Empty.Header>
                <Empty.Title>{t('no-channels', 'No channels yet')}</Empty.Title>
              </Empty.Header>
            </Empty>
          )}
        </RecordTable.Provider>
      )}
      <ChannelSheet channels={list} />
    </PageContainer>
  );
};
