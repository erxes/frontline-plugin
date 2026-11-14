import { IconChevronRight } from '@tabler/icons-react';
import { Button, IconComponent, Skeleton } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { usePipelineCount } from '../pipelines/usePipelines.ts';
import { useTemplateCount } from '../responseTemplates/useResponseTemplates.ts';
import { CHANNELS_PATH, useChannel, usePanel } from './useChannels.ts';

/** One channel's settings: edit it, and go to its members, response templates and pipelines. */
export const ChannelPage = () => {
  const { t } = useTranslation('frontline');
  const { id = '' } = useParams();
  const { data: channel, isPending, error } = useChannel(id);
  const { openChannel } = usePanel();
  const templateCount = useTemplateCount(id);
  const pipelineCount = usePipelineCount(id);

  if (isPending) return <Skeleton className="m-8 h-40" />;

  if (error) return <p className="m-8 text-sm text-destructive-text">{error.message}</p>;

  // A count still loading shows nothing rather than zero.
  const counted = (key: string, one: string, other: string, count: number | undefined) =>
    count === undefined ? '' : t(key, { defaultValue_one: one, defaultValue_other: other, count });

  const pages = [
    {
      segment: 'members',
      label: t('manage-channel-members', 'Manage channel members'),
      count: counted(
        'member-count',
        '{{count}} member',
        '{{count}} members',
        channel.memberIds.length,
      ),
    },
    {
      segment: 'response',
      label: t('manage-channel-response-templates', 'Manage channel response templates'),
      count: counted('template-count', '{{count}} template', '{{count}} templates', templateCount),
    },
    {
      segment: 'pipelines',
      label: t('manage-channel-pipelines', 'Manage channel pipelines'),
      count: counted('pipeline-count', '{{count}} pipeline', '{{count}} pipelines', pipelineCount),
    },
  ];

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

      {pages.map((page) => (
        <SectionLink
          key={page.segment}
          to={`${CHANNELS_PATH}/${channel.id}/${page.segment}`}
          label={page.label}
          count={page.count}
        />
      ))}
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
