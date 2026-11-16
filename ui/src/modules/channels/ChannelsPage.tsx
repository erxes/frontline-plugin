import { memberQueries } from '@erxes/core-contract/client';
import {
  IconAlignLeft,
  IconCalendarPlus,
  IconCircles,
  IconFileDescription,
  IconTrash,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';
import {
  Avatar,
  Button,
  ListFilter,
  memberName,
  MemberInline,
  PageContainer,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  type TListFilterField,
  useMembersById,
  useOpenRecord,
  ViewBar,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { CHANNEL_TYPE } from '~/plugin.ts';
import { CreateButton, ListEmpty } from '~/shared/List.tsx';
import { DeleteButton, RowActions, SelectionBar, TextCell } from '~/shared/Records.tsx';
import { column as columnOf, DateCell, Rows } from '~/shared/Table.tsx';
import { ChannelsHeader } from './ChannelsHeader.tsx';
import { type Channel, useChannels, useDeleteChannels } from './useChannels.ts';

const column = columnOf<Channel>;

/** The name opens the channel in core's side panel, as a customer's name does. */
const NameCell = ({ channel }: { channel: Channel }) => {
  const { open } = useOpenRecord();

  return (
    <RecordTableInlineCell>
      <Button
        variant="ghost"
        className="w-full justify-start"
        onClick={() => open({ contentType: CHANNEL_TYPE, contentId: channel.id })}
      >
        {channel.name}
      </Button>
    </RecordTableInlineCell>
  );
};

const MoreCell = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation('frontline');
  const { deleteChannels } = useDeleteChannels();

  if (!channel.canManage) return null;

  return (
    <RowActions
      label={t('channel-actions', 'Actions for {{name}}', { name: channel.name })}
      actions={[
        {
          value: 'delete',
          icon: <IconTrash />,
          label: t('delete', 'Delete'),
          onSelect: () => void deleteChannels([channel.id]),
        },
      ]}
    />
  );
};

/** The first members' avatars, then how many more. */
const MemberAvatars = ({ ids }: { ids: string[] }) => {
  const shown = ids.slice(0, 4);
  const members = useMembersById(shown, memberQueries);

  return (
    <RecordTableInlineCell>
      <span className="flex gap-0.5">
        {shown.map((id) => {
          const member = members.get(id);
          const name = member ? memberName(member) : '';

          return (
            <Avatar key={id} size="sm" title={name}>
              {member?.avatarUrl && <Avatar.Image src={member.avatarUrl} alt={name} />}
              <Avatar.Fallback>{name.charAt(0).toUpperCase()}</Avatar.Fallback>
            </Avatar>
          );
        })}
      </span>
      {ids.length > shown.length && (
        <span className="text-muted-foreground text-xs">+{ids.length - shown.length}</span>
      )}
    </RecordTableInlineCell>
  );
};

const useColumns = (): RecordTableColumnDef<Channel>[] => {
  const { t } = useTranslation('frontline');

  return [
    {
      id: 'more',
      header: () => <RecordTable.ColumnSelector />,
      cell: ({ row }) => <MoreCell channel={row.original} />,
      size: 33,
    },
    RecordTable.checkboxColumnOf<Channel>(),
    column('name', t('name', 'Name'), IconAlignLeft, 220, (channel) => (
      <NameCell channel={channel} />
    )),
    column('description', t('description', 'Description'), IconFileDescription, 260, (channel) => (
      <TextCell value={channel.description} />
    )),
    column('members', t('members', 'Members'), IconUsers, 140, (channel) => (
      <MemberAvatars ids={channel.memberIds} />
    )),
    column('createdBy', t('created-by', 'Created by'), IconUser, 180, (channel) => (
      <RecordTableInlineCell>
        <MemberInline memberId={channel.createdBy} members={memberQueries} />
      </RecordTableInlineCell>
    )),
    column('createdAt', t('created-at', 'Created at'), IconCalendarPlus, 130, (channel) => (
      <DateCell date={channel.createdAt} />
    )),
  ];
};

/** Deletes the selected channels from the bar under the table. */
const ChannelsCommandBar = () => {
  const { deleteChannels, isPending } = useDeleteChannels();

  return (
    <SelectionBar>
      {(selected, clear) => (
        <DeleteButton disabled={isPending} onClick={() => void deleteChannels(selected, clear)} />
      )}
    </SelectionBar>
  );
};

/**
 * The channels the member works in, by name, under core's list bar: the filter (`F`) on the
 * fields below, whose rules the API applies (`api/src/modules/channels/channels.ts`). A channel
 * opens in core's side panel; Create channel opens a new one there.
 */
export const ChannelsPage = () => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const { data, isPending, error } = useChannels();
  const channels = data?.channels ?? [];
  const columns = useColumns();

  const fields: TListFilterField[] = [
    { path: 'subject.name', label: t('name', 'Name'), type: 'text', icon: IconAlignLeft },
    {
      path: 'subject.description',
      label: t('description', 'Description'),
      type: 'text',
      icon: IconFileDescription,
    },
    { path: 'subject.memberIds', label: t('members', 'Members'), type: 'member', icon: IconUsers },
    { path: 'subject.createdBy', label: t('created-by', 'Created by'), type: 'member' },
    {
      path: 'subject.createdAt',
      label: t('created-at', 'Created at'),
      type: 'date',
      icon: IconCalendarPlus,
    },
  ];

  const create = () => openNew(CHANNEL_TYPE);

  return (
    <PageContainer>
      <ChannelsHeader>
        <CreateButton
          allowed={data?.canCreate ?? false}
          label={t('create-channel', 'Create channel')}
          onClick={create}
        />
      </ChannelsHeader>
      <ViewBar allLabel={t('all-channels', 'All channels')}>
        <ListFilter
          id="frontline-channels"
          fields={fields}
          members={memberQueries}
          totalCount={isPending ? undefined : channels.length}
        />
      </ViewBar>
      {error ? (
        <p className="m-3 text-sm text-destructive-text">{error.message}</p>
      ) : !isPending && channels.length === 0 ? (
        <ListEmpty
          icon={<IconCircles />}
          title={t('no-channels-yet', 'No channels yet')}
          description={t(
            'no-channels-description',
            'A channel groups the inboxes, pipelines and members a team works with.',
          )}
        />
      ) : (
        <RecordTable.Provider
          tableId="frontline_channels"
          columns={columns}
          data={channels}
          stickyColumns={['more', 'checkbox', 'name']}
          className="m-3"
        >
          <Rows isPending={isPending} />
          <ChannelsCommandBar />
        </RecordTable.Provider>
      )}
    </PageContainer>
  );
};
