import { IconCircles } from '@tabler/icons-react';
import { buttonVariants, PageContainer, PageHeader, Separator, Skeleton } from 'erxes-ui';
import { type ComponentType, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useMatch } from 'react-router-dom';
import { CreateButton } from '../shared/List.tsx';
import { ChannelPanels } from './ChannelPanels.tsx';
import { CHANNELS_PATH, useChannel, useChannels, usePanel } from './useChannels.ts';

const crumb = buttonVariants({ variant: 'ghost' });

/** The create button a channel's list page puts in the header, by the path after the channel id. */
const CREATE_BUTTONS: Record<string, ComponentType<{ channelId: string }>> = {
  response: lazy(async () => ({
    default: (await import('../responseTemplates/ResponseTemplatesPage.tsx')).CreateTemplate,
  })),
  pipelines: lazy(async () => ({
    default: (await import('../pipelines/PipelinesPage.tsx')).CreatePipeline,
  })),
};

/** A channel's pages below its own, by the path segment after its id. */
const useSubPages = () => {
  const { t } = useTranslation('frontline');

  return {
    members: t('members', 'Members'),
    response: t('response-templates', 'Response templates'),
    pipelines: t('pipelines', 'Pipelines'),
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

  return (
    <CreateButton
      allowed={data?.canCreate ?? false}
      label={t('create-channel', 'Create channel')}
      onClick={() => openChannel('new')}
    />
  );
};

/** The channel settings pages under one header, with the side panels they open. */
export const ChannelsLayout = () => {
  const { t } = useTranslation('frontline');
  const detail = useMatch(`${CHANNELS_PATH}/:id/*`);
  const id = detail?.params.id;
  const rest = detail?.params['*'] ?? '';
  const sub = rest.split('/')[0];
  const Create = CREATE_BUTTONS[rest];

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
          {id && Create && (
            <Suspense>
              <Create channelId={id} />
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
