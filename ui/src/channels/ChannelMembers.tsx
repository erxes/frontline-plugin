import { memberQueries } from '@erxes/core-contract/client';
import { IconX } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Button, MemberInline, Select, SelectMember, Skeleton } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '../orpc.ts';
import { type Channel, useChannel, useChannelChange, useRoleNames } from './useChannels.ts';

/** Who works the channel. Its admins add members, change roles and remove members. */
export const ChannelMembers = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation('frontline');
  const roles = useRoleNames();
  const { data, isPending } = useChannel(channel.id);
  const change = useChannelChange();
  const add = useMutation(orpc.channels.addMember.mutationOptions(change));
  const setRole = useMutation(orpc.channels.setRole.mutationOptions(change));
  const remove = useMutation(orpc.channels.removeMember.mutationOptions(change));

  return (
    <section className="flex flex-col gap-3" aria-labelledby="channel-members">
      <h2 id="channel-members" className="text-sm font-semibold">
        {t('members', 'Members')}
      </h2>
      {channel.canManage && (
        <SelectMember.Field
          value={null}
          onValueChange={(userId) => userId && add.mutate({ id: channel.id, userId })}
          members={memberQueries}
          placeholder={t('add-member', 'Add a member')}
        />
      )}
      {isPending ? (
        <Skeleton className="h-8" />
      ) : (
        <ul className="flex flex-col gap-2">
          {data?.members.map((member) => (
            <li key={member.userId} className="flex items-center gap-2">
              <MemberInline memberId={member.userId} members={memberQueries} className="flex-1" />
              {channel.canManage ? (
                <>
                  <Select
                    value={member.role}
                    onValueChange={(role) =>
                      setRole.mutate({ id: channel.id, userId: member.userId, role })
                    }
                  >
                    <Select.Trigger
                      className="w-28"
                      aria-label={t('role-of', 'Role: {{role}}', { role: roles[member.role] })}
                    >
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="admin">{roles.admin}</Select.Item>
                      <Select.Item value="member">{roles.member}</Select.Item>
                    </Select.Content>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('remove-member', 'Remove from channel')}
                    onClick={() => remove.mutate({ id: channel.id, userId: member.userId })}
                  >
                    <IconX />
                  </Button>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">{roles[member.role]}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
