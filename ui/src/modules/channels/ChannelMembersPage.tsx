import { memberQueries } from '@erxes/core-contract/client';
import {
  IconCalendarPlus,
  IconPlus,
  IconTrash,
  IconUser,
  IconUserShield,
} from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Button,
  ListFilter,
  MemberInline,
  memberName,
  PageContainer,
  Popover,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  Select,
  type TListFilterField,
  useConfirm,
  useListFilterParams,
  useMembersById,
  ViewBar,
} from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { orpc } from '~/orpc.ts';
import { DeleteButton, RowActions, SelectionBar } from '~/shared/Records.tsx';
import { DateCell, Rows } from '~/shared/Table.tsx';
import { MemberPicker } from './ChannelNew.tsx';
import { ChannelsHeader } from './ChannelsHeader.tsx';
import {
  type Channel,
  type ChannelMember,
  useChannel,
  useChannelChange,
  useRoleNames,
} from './useChannels.ts';

/** A member as a table row, keyed by their user id. */
type MemberRow = ChannelMember & { id: string };

/** Asks, then removes members; the API refuses to leave the channel without an admin. */
const useRemoveMembers = (channelId: string) => {
  const { t } = useTranslation('frontline');
  const { confirm } = useConfirm();
  const remove = useMutation(orpc.channels.removeMembers.mutationOptions(useChannelChange()));

  const removeMembers = async (userIds: string[], done?: () => void) => {
    await confirm({
      message: t('remove-members-confirm', {
        defaultValue_one: 'Remove this member from the channel?',
        defaultValue_other: 'Remove {{count}} members from this channel?',
        count: userIds.length,
      }),
      options: { okLabel: t('remove', 'Remove') },
    });
    remove.mutate({ id: channelId, userIds }, { onSuccess: done });
  };

  return { removeMembers, isPending: remove.isPending };
};

/**
 * The channel's members, narrowed by the filter bar. The API applies its rules; names live in
 * core, so the search matches the names this page shows.
 */
const useMemberRows = (channelId: string) => {
  const { filter, search } = useListFilterParams();
  const query = useQuery(orpc.channels.members.queryOptions({ input: { id: channelId, filter } }));
  const members = useMembersById(query.data?.map((row) => row.userId) ?? [], memberQueries);
  const needle = search?.toLowerCase();

  const rows: MemberRow[] = (query.data ?? [])
    .filter((row) => {
      const member = members.get(row.userId);

      return !needle || (member ? memberName(member).toLowerCase().includes(needle) : false);
    })
    .map((row) => ({ ...row, id: row.userId }));

  return { ...query, rows };
};

const MoreCell = ({ channel, member }: { channel: Channel; member: MemberRow }) => {
  const { t } = useTranslation('frontline');
  const { removeMembers } = useRemoveMembers(channel.id);

  return (
    <RowActions
      label={t('member-actions', 'Member actions')}
      actions={[
        {
          value: 'remove',
          icon: <IconTrash />,
          label: t('remove', 'Remove'),
          onSelect: () => void removeMembers([member.userId]),
        },
      ]}
    />
  );
};

const RoleCell = ({ channel, member }: { channel: Channel; member: MemberRow }) => {
  const { t } = useTranslation('frontline');
  const roles = useRoleNames();
  const setRole = useMutation(orpc.channels.setRole.mutationOptions(useChannelChange()));

  if (!channel.canManage)
    return <RecordTableInlineCell>{roles[member.role]}</RecordTableInlineCell>;

  return (
    <RecordTableInlineCell>
      <Select
        value={member.role}
        onValueChange={(role) => setRole.mutate({ id: channel.id, userId: member.userId, role })}
      >
        <Select.Trigger
          variant="flush"
          aria-label={t('role-of', 'Role: {{role}}', { role: roles[member.role] })}
        >
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="admin">{roles.admin}</Select.Item>
          <Select.Item value="member">{roles.member}</Select.Item>
        </Select.Content>
      </Select>
    </RecordTableInlineCell>
  );
};

/** Members who can't manage the channel get no row actions or selection. */
const useColumns = (channel: Channel): RecordTableColumnDef<MemberRow>[] => {
  const { t } = useTranslation('frontline');

  const manage: RecordTableColumnDef<MemberRow>[] = [
    {
      id: 'more',
      cell: ({ row }) => <MoreCell channel={channel} member={row.original} />,
      size: 33,
    },
    RecordTable.checkboxColumnOf<MemberRow>(),
  ];

  return [
    ...(channel.canManage ? manage : []),
    {
      id: 'member',
      header: () => <RecordTable.InlineHead label={t('member', 'Member')} icon={IconUser} />,
      cell: ({ row }) => (
        <RecordTableInlineCell>
          <MemberInline memberId={row.original.userId} members={memberQueries} />
        </RecordTableInlineCell>
      ),
      size: 280,
    },
    {
      id: 'role',
      header: () => <RecordTable.InlineHead label={t('role', 'Role')} icon={IconUserShield} />,
      cell: ({ row }) => <RoleCell channel={channel} member={row.original} />,
      size: 160,
    },
    {
      id: 'createdAt',
      header: () => (
        <RecordTable.InlineHead label={t('added-at', 'Added')} icon={IconCalendarPlus} />
      ),
      cell: ({ row }) => <DateCell date={row.original.createdAt} />,
      size: 130,
    },
  ];
};

/** Removes the selected members; only admins get the checkboxes that select them. */
const MembersCommandBar = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation('frontline');
  const { removeMembers, isPending } = useRemoveMembers(channel.id);

  return (
    <SelectionBar>
      {(selected, clear) => (
        <DeleteButton
          label={t('remove', 'Remove')}
          disabled={isPending}
          onClick={() => void removeMembers(selected, clear)}
        />
      )}
    </SelectionBar>
  );
};

/** The header's action: pick teammates who aren't in the channel yet, then add them. */
const AddMembers = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation('frontline');
  const change = useChannelChange();
  const [open, setOpen] = useState(false);
  const [userIds, setUserIds] = useState<string[]>([]);

  const add = useMutation(
    orpc.channels.addMembers.mutationOptions({
      ...change,
      onSuccess: async () => {
        await change.onSuccess();
        setUserIds([]);
        setOpen(false);
      },
    }),
  );

  if (!channel.canManage) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger render={<Button />}>
        <IconPlus />
        {t('add-members', 'Add members')}
      </Popover.Trigger>
      <Popover.Content align="end" className="w-80">
        <div className="flex flex-col gap-2 p-2">
          <MemberPicker value={userIds} onValueChange={setUserIds} exclude={channel.memberIds} />
          <Button
            className="self-end"
            disabled={userIds.length === 0 || add.isPending}
            onClick={() => add.mutate({ id: channel.id, userIds })}
          >
            {t('add-members', 'Add members')}
          </Button>
        </div>
      </Popover.Content>
    </Popover>
  );
};

const MembersTable = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation('frontline');
  const { rows, isPending, error } = useMemberRows(channel.id);
  const columns = useColumns(channel);

  const fields: TListFilterField[] = [
    { path: 'subject.userId', label: t('member', 'Member'), type: 'member', icon: IconUser },
    {
      path: 'subject.role',
      label: t('role', 'Role'),
      type: 'select',
      icon: IconUserShield,
      options: Object.entries(useRoleNames()).map(([value, label]) => ({ value, label })),
    },
    {
      path: 'subject.createdAt',
      label: t('added-at', 'Added'),
      type: 'date',
      icon: IconCalendarPlus,
    },
  ];

  return (
    <>
      <ViewBar allLabel={t('all-members', 'All members')}>
        <ListFilter
          id="frontline-channel-members"
          fields={fields}
          members={memberQueries}
          totalCount={isPending ? undefined : rows.length}
        />
      </ViewBar>
      {error ? (
        <p className="m-3 text-sm text-destructive-text">{error.message}</p>
      ) : (
        <RecordTable.Provider
          tableId="frontline_channel_members"
          columns={columns}
          data={rows}
          stickyColumns={['more', 'checkbox', 'member']}
          className="m-3"
        >
          <Rows isPending={isPending} skeletons={6} />
          <MembersCommandBar channel={channel} />
        </RecordTable.Provider>
      )}
    </>
  );
};

/** A channel's members: add several, change roles, remove one or many. */
export const ChannelMembersPage = () => {
  const { t } = useTranslation('frontline');
  const { id = '' } = useParams();
  const { data, error } = useChannel(id);

  return (
    <PageContainer>
      <ChannelsHeader channelId={id} label={t('members', 'Members')}>
        {data && <AddMembers channel={data} />}
      </ChannelsHeader>
      {error && <p className="m-3 text-sm text-destructive-text">{error.message}</p>}
      {data && <MembersTable channel={data} />}
    </PageContainer>
  );
};
