import { IconCircles, IconPlus } from '@tabler/icons-react';
import {
  Button,
  buttonVariants,
  Kbd,
  PageContainer,
  PageHeader,
  Separator,
  Skeleton,
  useScopedHotkeys,
} from 'erxes-ui';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useMatch } from 'react-router-dom';
import { ChannelPanels } from './ChannelPanels.tsx';
import { CHANNELS_PATH, useChannel, useChannels, usePanel } from './useChannels.ts';

const crumb = buttonVariants({ variant: 'ghost' });

const CreateTemplate = lazy(async () => ({
  default: (await import('../responseTemplates/ResponseTemplatesPage.tsx')).CreateTemplate,
}));

/** A channel's pages below its own, by the path segment after its id. */
const useSubPages = () => {
  const { t } = useTranslation('frontline');

  return {
    members: t('members', 'Members'),
    response: t('response-templates', 'Response templates'),
  };
};

/** The open channel by name, then the page of it that is open. */
const ChannelCrumbs = ({ id, sub }: { id: string; sub: string | undefined }) => {
  const { data } = useChannel(id);
  const pages = useSubPages();
  const page = Object.entries(pages).find(([segment]) => segment === sub);

  return (
    <>
      <Separator.Inline />
      <Link to={`${CHANNELS_PATH}/${id}`} className={crumb}>
        {data?.name ?? '…'}
      </Link>
      {page && (
        <>
          <Separator.Inline />
          <Link to={`${CHANNELS_PATH}/${id}/${page[0]}`} className={crumb}>
            {page[1]}
          </Link>
        </>
      )}
    </>
  );
};

/** "Create channel", with C as its shortcut, for members who may create one. */
const CreateChannel = () => {
  const { t } = useTranslation('frontline');
  const { data } = useChannels();
  const { openChannel } = usePanel();

  useScopedHotkeys('c', () => data?.canCreate && openChannel('new'), 'app');

  if (!data?.canCreate) return null;

  return (
    <Button onClick={() => openChannel('new')}>
      <IconPlus />
      {t('create-channel', 'Create channel')}
      <Kbd>C</Kbd>
    </Button>
  );
};

/** The channel settings pages under one header, with the side panels they open. */
export const ChannelsLayout = () => {
  const { t } = useTranslation('frontline');
  const detail = useMatch(`${CHANNELS_PATH}/:id/*`);
  const id = detail?.params.id;
  const sub = detail?.params['*']?.split('/')[0];

  return (
    <PageContainer>
      <PageHeader>
        <PageHeader.Start>
          <Link to={CHANNELS_PATH} className={crumb}>
            <IconCircles />
            {t('channels', 'Channels')}
          </Link>
          {id && <ChannelCrumbs id={id} sub={sub} />}
        </PageHeader.Start>
        <PageHeader.End>
          {!id && <CreateChannel />}
          {id && sub === 'response' && (
            <Suspense>
              <CreateTemplate channelId={id} />
            </Suspense>
          )}
        </PageHeader.End>
      </PageHeader>
      <Suspense fallback={<Skeleton className="m-3 h-40" />}>
        <Outlet />
      </Suspense>
      <ChannelPanels />
    </PageContainer>
  );
};
