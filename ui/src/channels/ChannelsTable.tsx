import { memberQueries } from '@erxes/core-contract/client';
import {
  IconAlignLeft,
  IconCalendarPlus,
  IconCircleCheck,
  IconEdit,
  IconFileDescription,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  Avatar,
  memberName,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  toast,
  Tooltip,
  useFormat,
  useMembersById,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { orpc } from '../orpc.ts';
import {
  DeleteButton,
  RowActions,
  SelectionBar,
  TextCell,
  useConfirmDelete,
} from '../shared/Records.tsx';
import { type Channel, CHANNELS_PATH, useChannelChange, usePanel } from './useChannels.ts';

/** Asks for "delete" to be typed, then deletes the channels, reporting any the API refused. */
const useDeleteChannels = () => {
  const { t } = useTranslation('frontline');
  const confirm = useConfirmDelete();
  const change = useChannelChange();
  const remove = useMutation(orpc.channels.remove.mutationOptions());

  const deleteChannels = async (ids: string[], done?: () => void) => {
    await confirm(
      t('delete-channels-confirm', {
        defaultValue: 'Delete {{count}} channels?',
        count: ids.length,
      }),
    );
    const results = await Promise.allSettled(ids.map((id) => remove.mutateAsync({ id })));
    const failed = results.filter((result) => result.status === 'rejected');

    done?.();
    await change.onSuccess();

    if (failed.length > 0)
      toast({
        variant: 'destructive',
        title: t('channels-removed-with-failures', {
          defaultValue: '{{removed}} removed, {{failed}} failed',
          removed: ids.length - failed.length,
          failed: failed.length,
        }),
        description: failed[0]?.reason instanceof Error ? failed[0].reason.message : undefined,
      });
  };

  return { deleteChannels, isPending: remove.isPending };
};

const MoreCell = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation('frontline');
  const { openChannel } = usePanel();
  const { deleteChannels } = useDeleteChannels();

  if (!channel.canManage) return null;

  return (
    <RowActions
      label={t('channel-actions', 'Actions for {{name}}', { name: channel.name })}
      actions={[
        {
          value: 'edit',
          icon: <IconEdit />,
          label: t('edit', 'Edit'),
          onSelect: () => openChannel(channel.id),
        },
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

const CreatedCell = ({ date }: { date: Date }) => {
  const format = useFormat();

  return (
    <RecordTableInlineCell>
      <Tooltip>
        <Tooltip.Trigger>
          <span className="text-muted-foreground text-xs">{format.date(date)}</span>
        </Tooltip.Trigger>
        <Tooltip.Content>{format.dateTime(date)}</Tooltip.Content>
      </Tooltip>
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
    {
      id: 'name',
      header: () => <RecordTable.InlineHead label={t('name', 'Name')} icon={IconAlignLeft} />,
      cell: ({ row }) => (
        <RecordTableInlineCell>
          <Link to={`${CHANNELS_PATH}/${row.original.id}`} className="truncate hover:underline">
            {row.original.name}
          </Link>
        </RecordTableInlineCell>
      ),
      size: 220,
    },
    {
      id: 'description',
      header: () => (
        <RecordTable.InlineHead
          label={t('description', 'Description')}
          icon={IconFileDescription}
        />
      ),
      cell: ({ row }) => <TextCell value={row.original.description} />,
      size: 260,
    },
    {
      id: 'members',
      header: () => <RecordTable.InlineHead label={t('members', 'Members')} icon={IconUsers} />,
      cell: ({ row }) => <MemberAvatars ids={row.original.memberIds} />,
      size: 140,
    },
    {
      id: 'status',
      header: () => <RecordTable.InlineHead label={t('status', 'Status')} icon={IconCircleCheck} />,
      cell: () => (
        <RecordTableInlineCell>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-success" />
            {t('active', 'Active')}
          </span>
        </RecordTableInlineCell>
      ),
      size: 110,
    },
    {
      id: 'createdAt',
      header: () => (
        <RecordTable.InlineHead label={t('created-at', 'Created at')} icon={IconCalendarPlus} />
      ),
      cell: ({ row }) => <CreatedCell date={row.original.createdAt} />,
      size: 130,
    },
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

/** The channels as rows: open one by name, edit or delete it, or delete several at once. */
export const ChannelsTable = ({
  channels,
  isPending,
}: {
  channels: Channel[];
  isPending: boolean;
}) => (
  <RecordTable.Provider
    tableId="frontline_channels"
    columns={useColumns()}
    data={channels}
    stickyColumns={['more', 'checkbox', 'name']}
    className="m-3"
  >
    <RecordTable.Scroll>
      <RecordTable>
        <RecordTable.Header />
        <RecordTable.Body>
          {isPending && <RecordTable.RowSkeleton rows={10} />}
          <RecordTable.RowList />
        </RecordTable.Body>
      </RecordTable>
    </RecordTable.Scroll>
    <ChannelsCommandBar />
  </RecordTable.Provider>
);
