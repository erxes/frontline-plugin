import {
  IconExternalLink,
  IconGitBranch,
  IconMessageReply,
  IconPlus,
  IconTicket,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Button,
  buttonVariants,
  Select,
  Spinner,
  type TRecordSlotProps,
  useOpenRecord,
} from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useChoices } from '@/tickets/queries.ts';
import { orpc } from '~/orpc.ts';
import { PIPELINE_TYPE, RESPONSE_TEMPLATE_TYPE } from '~/plugin.ts';
import { channelTicketsPath } from '~/shared/listPath.ts';
import { MemberLine } from '~/shared/Person.tsx';
import { templatesQuery } from '~/shared/reference.ts';
import { ChannelIntegrations } from './ChannelIntegrations.tsx';
import { AddMembers, useRemoveMembers } from './ChannelMembersPage.tsx';
import {
  type Channel,
  CHANNELS_PATH,
  type ChannelMember,
  useChannel,
  useChannelChange,
  useRoleNames,
} from './useChannels.ts';

/** A tab's body once the channel loads: its error, or `children` given the channel. */
const WithChannel = ({
  id,
  children,
}: {
  id: string;
  children: (channel: Channel) => ReactNode;
}) => {
  const channel = useChannel(id);

  if (channel.isPending) return <Spinner area="lg" />;

  if (channel.isError) {
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {channel.error.message}
      </p>
    );
  }

  return children(channel.data);
};

/** A tab's top row: what it lists, and its one action, such as Create pipeline. */
const TabBar = ({ label, children }: { label: string; children?: ReactNode }) => (
  <div className="flex min-h-11 items-center justify-between gap-2 border-b px-4 py-2">
    <span className="text-xs font-medium text-accent-foreground">{label}</span>
    <span className="flex items-center gap-1">{children}</span>
  </div>
);

/** A tab with nothing in it yet: what would be here. */
const TabEmpty = ({ children }: { children: string }) => (
  <p className="px-4 py-6 text-center text-xs text-muted-foreground">{children}</p>
);

/** A link to the full page of what a tab lists, for its filters and bulk actions. */
const FullPageLink = ({ to, label }: { to: string; label: string }) => {
  const { t } = useTranslation('frontline');

  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
    >
      <IconExternalLink />
      {t('manage', 'Manage')}
    </Link>
  );
};

/** The Integrations tab: what brings conversations into the channel, and adding more. */
export const ChannelIntegrationsTab = ({ contentId }: TRecordSlotProps) => (
  <WithChannel id={contentId}>{(channel) => <ChannelIntegrations channel={channel} />}</WithChannel>
);

/**
 * The Ticket pipelines tab: the channel's pipelines, each opening in the panel with its statuses
 * and SLA, and a link to its tickets. Its admins create one here.
 */
export const ChannelPipelinesTab = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const { open, openNew } = useOpenRecord();
  const { pipelines, isPending } = useChoices();
  const own = pipelines.filter((pipeline) => pipeline.channelId === contentId);

  return (
    <WithChannel id={contentId}>
      {(channel) => (
        <>
          <TabBar label={t('ticket-pipelines', 'Ticket pipelines')}>
            <FullPageLink
              to={`${CHANNELS_PATH}/${encodeURIComponent(channel.id)}/pipelines`}
              label={t('manage-channel-pipelines', 'Manage channel pipelines')}
            />
            {channel.canManage && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openNew(PIPELINE_TYPE, { channelId: channel.id })}
              >
                <IconPlus />
                {t('create-pipeline', 'Create pipeline')}
              </Button>
            )}
          </TabBar>
          {isPending ? (
            <Spinner area="lg" />
          ) : own.length === 0 ? (
            <TabEmpty>
              {t(
                'no-channel-pipelines',
                'No pipeline yet. A pipeline turns this channel’s requests into tickets.',
              )}
            </TabEmpty>
          ) : (
            <ul className="flex flex-col p-2">
              {own.map((pipeline) => (
                <li key={pipeline.id} className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-w-0 flex-1 justify-start"
                    onClick={() => open({ contentType: PIPELINE_TYPE, contentId: pipeline.id })}
                  >
                    <IconGitBranch />
                    <span className="truncate">{pipeline.name}</span>
                  </Button>
                  <Link
                    to={channelTicketsPath(pipeline.channelId, pipeline.id)}
                    className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                  >
                    <IconTicket />
                    {t('tickets', 'Tickets')}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </WithChannel>
  );
};

/** A member's role, which the channel's admins change in place. */
const RoleSelect = ({ channel, member }: { channel: Channel; member: ChannelMember }) => {
  const { t } = useTranslation('frontline');
  const roles = useRoleNames();
  const setRole = useMutation(orpc.channels.setRole.mutationOptions(useChannelChange()));

  if (!channel.canManage || channel.ownerId) {
    return <span className="px-2 text-xs text-muted-foreground">{roles[member.role]}</span>;
  }

  return (
    <Select
      value={member.role}
      onValueChange={(role) => setRole.mutate({ id: channel.id, userId: member.userId, role })}
    >
      <Select.Trigger
        variant="flush"
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
  );
};

/** One member: who, their role, and for admins, removing them. */
const MemberRow = ({ channel, member }: { channel: Channel; member: ChannelMember }) => {
  const { t } = useTranslation('frontline');
  const { removeMembers } = useRemoveMembers(channel.id);

  return (
    <li className="flex items-center gap-2 rounded px-2 py-1 hover:bg-accent">
      <span className="min-w-0 flex-1 text-xs">
        <MemberLine id={member.userId} />
      </span>
      <RoleSelect channel={channel} member={member} />
      {channel.canManage && !channel.ownerId && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('remove', 'Remove')}
          onClick={() => void removeMembers([member.userId])}
        >
          <IconTrash />
        </Button>
      )}
    </li>
  );
};

const MemberRows = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation('frontline');
  const members = useQuery(orpc.channels.members.queryOptions({ input: { id: channel.id } }));

  return (
    <>
      <TabBar label={t('members', 'Members')}>
        <FullPageLink
          to={`${CHANNELS_PATH}/${encodeURIComponent(channel.id)}/members`}
          label={t('manage-channel-members', 'Manage channel members')}
        />
        <AddMembers channel={channel} />
      </TabBar>
      {members.error ? (
        <p role="alert" className="p-3 text-xs text-destructive-text">
          {members.error.message}
        </p>
      ) : !members.data ? (
        <Spinner area="lg" />
      ) : (
        <ul className="flex flex-col p-2">
          {members.data.map((member) => (
            <MemberRow key={member.userId} channel={channel} member={member} />
          ))}
        </ul>
      )}
    </>
  );
};

/**
 * The Members tab: who works the channel's conversations and tickets, and as what. Admins add
 * teammates, change roles and remove them here.
 */
export const ChannelMembersTab = ({ contentId }: TRecordSlotProps) => (
  <WithChannel id={contentId}>{(channel) => <MemberRows channel={channel} />}</WithChannel>
);

const TemplateRows = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation('frontline');
  const { open, openNew } = useOpenRecord();
  const templates = useQuery(templatesQuery(channel.id));
  const rows = templates.data?.templates ?? [];

  return (
    <>
      <TabBar label={t('response-templates', 'Response templates')}>
        <FullPageLink
          to={`${CHANNELS_PATH}/${encodeURIComponent(channel.id)}/response`}
          label={t('manage-channel-response-templates', 'Manage channel response templates')}
        />
        {channel.canManage && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openNew(RESPONSE_TEMPLATE_TYPE, { channelId: channel.id })}
          >
            <IconPlus />
            {t('create', 'Create')}
          </Button>
        )}
      </TabBar>
      {templates.isPending ? (
        <Spinner area="lg" />
      ) : rows.length === 0 ? (
        <TabEmpty>
          {t(
            'response-templates-description',
            'Saved replies that members of this channel insert into a conversation.',
          )}
        </TabEmpty>
      ) : (
        <ul className="flex flex-col p-2">
          {rows.map((template) => (
            <li key={template.id}>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() =>
                  open({ contentType: RESPONSE_TEMPLATE_TYPE, contentId: template.id })
                }
              >
                <IconMessageReply />
                <span className="truncate">{template.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

/** The Response templates tab: the saved replies the channel's members insert, newest first. */
export const ChannelTemplatesTab = ({ contentId }: TRecordSlotProps) => (
  <WithChannel id={contentId}>{(channel) => <TemplateRows channel={channel} />}</WithChannel>
);
