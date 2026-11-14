import { IconCircles, IconPlus } from '@tabler/icons-react';
import {
  Button,
  buttonVariants,
  Kbd,
  PageContainer,
  PageHeader,
  Separator,
  useScopedHotkeys,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useMatch } from 'react-router-dom';
import { ChannelPanels } from './ChannelPanels.tsx';
import { CHANNELS_PATH, useChannel, useChannels, usePanel } from './useChannels.ts';

const crumb = buttonVariants({ variant: 'ghost' });

/** Channels, then the open channel by name, then its members. */
const ChannelCrumbs = ({ id, members }: { id: string; members: boolean }) => {
  const { t } = useTranslation('frontline');
  const { data } = useChannel(id);

  return (
    <>
      <Separator.Inline />
      <Link to={`${CHANNELS_PATH}/${id}`} className={crumb}>
        {data?.name ?? '…'}
      </Link>
      {members && (
        <>
          <Separator.Inline />
          <Link to={`${CHANNELS_PATH}/${id}/members`} className={crumb}>
            {t('members', 'Members')}
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

  return (
    <PageContainer>
      <PageHeader>
        <PageHeader.Start>
          <Link to={CHANNELS_PATH} className={crumb}>
            <IconCircles />
            {t('channels', 'Channels')}
          </Link>
          {id && <ChannelCrumbs id={id} members={detail.params['*'] === 'members'} />}
        </PageHeader.Start>
        <PageHeader.End>{!id && <CreateChannel />}</PageHeader.End>
      </PageHeader>
      <Outlet />
      <ChannelPanels />
    </PageContainer>
  );
};
