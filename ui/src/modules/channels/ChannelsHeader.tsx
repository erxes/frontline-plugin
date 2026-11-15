import { IconCircles } from '@tabler/icons-react';
import { buttonVariants, PageHeader, Separator } from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CHANNELS_PATH, useChannel } from './useChannels.ts';

/** One level of the breadcrumb: a link, or the page itself when it's last. */
const Crumb = ({ to, children }: { to?: string; children: ReactNode }) =>
  to ? (
    <Link to={to} className={buttonVariants({ variant: 'ghost' })}>
      {children}
    </Link>
  ) : (
    <span className="flex h-8 items-center gap-1.5 px-3 text-sm font-medium">{children}</span>
  );

const ChannelCrumb = ({ id, last }: { id: string; last: boolean }) => {
  const { data } = useChannel(id);

  return (
    <>
      <Separator.Inline />
      <Crumb to={last ? undefined : `${CHANNELS_PATH}/${id}`}>{data?.name ?? '…'}</Crumb>
    </>
  );
};

/**
 * The header of the channel settings pages, as core's breadcrumb draws it: Channels, then the
 * open channel, then the page of it (`label`). `children` is the page's one primary action.
 */
export const ChannelsHeader = ({
  channelId,
  label,
  children,
}: {
  channelId?: string;
  label?: string;
  children?: ReactNode;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <PageHeader>
      <PageHeader.Start>
        <Crumb to={channelId ? CHANNELS_PATH : undefined}>
          <IconCircles />
          {t('channels', 'Channels')}
        </Crumb>
        {channelId && <ChannelCrumb id={channelId} last={!label} />}
        {label && (
          <>
            <Separator.Inline />
            <Crumb>{label}</Crumb>
          </>
        )}
      </PageHeader.Start>
      {children && <PageHeader.End>{children}</PageHeader.End>}
    </PageHeader>
  );
};
