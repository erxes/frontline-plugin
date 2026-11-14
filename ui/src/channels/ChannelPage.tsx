import { IconChevronRight } from '@tabler/icons-react';
import { Button, IconComponent, Skeleton } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useResponseTemplates } from '../responseTemplates/useResponseTemplates.ts';
import { CHANNELS_PATH, useChannel, usePanel } from './useChannels.ts';

/** One channel's settings: edit it, and go to its members and response templates. */
export const ChannelPage = () => {
  const { t } = useTranslation('frontline');
  const { id = '' } = useParams();
  const { data: channel, isPending, error } = useChannel(id);
  const { openChannel } = usePanel();
  const templates = useResponseTemplates(id);

  if (isPending) return <Skeleton className="m-8 h-40" />;

  if (error) return <p className="m-8 text-sm text-destructive-text">{error.message}</p>;

  return (
    <div className="w-full px-4 sm:px-8 lg:px-16 py-8 flex flex-col gap-4">
      <h1 className="text-2xl font-semibold flex items-center gap-2">
        {channel.icon && <IconComponent name={channel.icon} className="size-6" />}
        {channel.name}
      </h1>
      {channel.description && <p className="text-muted-foreground">{channel.description}</p>}

      {channel.canManage && (
        <section className="w-full border border-muted-foreground/15 rounded-md p-4">
          <Button variant="secondary" onClick={() => openChannel(channel.id)}>
            {t('edit', 'Edit')}
          </Button>
        </section>
      )}

      <SectionLink
        to={`${CHANNELS_PATH}/${channel.id}/members`}
        label={t('manage-channel-members', 'Manage channel members')}
        count={t('member-count', {
          defaultValue: '{{count}} members',
          count: channel.memberIds.length,
        })}
      />
      <SectionLink
        to={`${CHANNELS_PATH}/${channel.id}/response`}
        label={t('response-templates', 'Response templates')}
        count={
          templates.totalCount === undefined
            ? ''
            : t('template-count', {
                defaultValue: '{{count}} templates',
                count: templates.totalCount,
              })
        }
      />
    </div>
  );
};

/** A card that opens one of the channel's pages, with how many records it holds. */
const SectionLink = ({ to, label, count }: { to: string; label: string; count: string }) => (
  <Link
    to={to}
    className="w-full border border-muted-foreground/15 rounded-md p-4 hover:bg-sidebar/50 flex items-center justify-between"
  >
    <span>{label}</span>
    <span className="flex items-center gap-2 text-xs">
      {count}
      <IconChevronRight className="size-4" />
    </span>
  </Link>
);
