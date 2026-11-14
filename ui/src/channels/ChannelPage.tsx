import { IconChevronRight } from '@tabler/icons-react';
import { Button, IconComponent, Skeleton } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { CHANNELS_PATH, useChannel, usePanel } from './useChannels.ts';

/** One channel's settings: edit it, and go to its members. */
export const ChannelPage = () => {
  const { t } = useTranslation('frontline');
  const { id = '' } = useParams();
  const { data: channel, isPending, error } = useChannel(id);
  const { openChannel } = usePanel();

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

      <Link
        to={`${CHANNELS_PATH}/${channel.id}/members`}
        className="w-full border border-muted-foreground/15 rounded-md p-4 hover:bg-sidebar/50 flex items-center justify-between"
      >
        <span>{t('manage-channel-members', 'Manage channel members')}</span>
        <span className="flex items-center gap-2 text-xs">
          {t('member-count', {
            defaultValue: '{{count}} members',
            count: channel.memberIds.length,
          })}
          <IconChevronRight className="size-4" />
        </span>
      </Link>
    </div>
  );
};
