import { memberQueries } from '@erxes/core-contract/client';
import { IconTrash, IconUser, IconUserShield } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  MemberInline,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  Select,
  Skeleton,
  useConfirm,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { orpc } from '../orpc.ts';
import { CreateButton } from '../shared/List.tsx';
import { DeleteButton, RowActions, SelectionBar } from '../shared/Records.tsx';
import {
  type Channel,
  type ChannelMember,
  useChannel,
  useChannelChange,
  usePanel,
  useRoleNames,
} from './useChannels.ts';

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

const MoreCell = ({ channel, member }: { channel: Channel; member: ChannelMember }) => {
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

const RoleCell = ({ channel, member }: { channel: Channel; member: ChannelMember }) => {
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

/** A member as a table row, keyed by their user id. */
type MemberRow = ChannelMember & { id: string };

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

const MembersTable = ({ channel }: { channel: Channel & { members: ChannelMember[] } }) => {
  const { t } = useTranslation('frontline');
  const { addMembers } = usePanel();
  const columns = useColumns(channel);

  return (
    <div className="h-full overflow-auto px-8">
      <div className="flex justify-between py-6">
        <h1 className="text-xl font-semibold">{t('members', 'Members')}</h1>
        <CreateButton
          allowed={channel.canManage}
          label={t('add-members', 'Add members')}
          onClick={() => addMembers(channel.id)}
        />
      </div>
      <RecordTable.Provider
        tableId="frontline_channel_members"
        columns={columns}
        data={channel.members.map((member) => ({ ...member, id: member.userId }))}
        stickyColumns={['more', 'checkbox', 'member']}
      >
        <RecordTable.Scroll>
          <RecordTable>
            <RecordTable.Header />
            <RecordTable.Body>
              <RecordTable.RowList />
            </RecordTable.Body>
          </RecordTable>
        </RecordTable.Scroll>
        <MembersCommandBar channel={channel} />
      </RecordTable.Provider>
    </div>
  );
};

/** A channel's members: add several, change roles, remove one or many. */
export const ChannelMembersPage = () => {
  const { id = '' } = useParams();
  const { data, isPending, error } = useChannel(id);

  if (isPending) return <Skeleton className="m-8 h-40" />;

  if (error) return <p className="m-8 text-sm text-destructive-text">{error.message}</p>;

  return <MembersTable channel={data} />;
};
