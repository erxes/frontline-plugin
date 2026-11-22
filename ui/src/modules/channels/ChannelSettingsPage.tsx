import { IconLink, IconMessageCirclePlus, IconSettings, IconTrash } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  buttonVariants,
  Card,
  Form,
  IconPicker,
  Input,
  PageContainer,
  ScrollArea,
  Skeleton,
  Textarea,
  toast,
  useOpenRecord,
} from 'erxes-ui';
import type { ReactNode } from 'react';
import { useForm, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConnectMenu, useCanConnect } from '@/integrations/ConnectMenu.tsx';
import { orpc } from '~/orpc.ts';
import { CHANNEL_TYPE, INTEGRATION_TYPE, PLUGIN } from '~/plugin.ts';
import { channelPath, useChannelScope } from '~/shared/channelScope.ts';
import { AppHeader } from '~/shared/Header.tsx';
import { CHANNEL_ICON } from '~/shared/icons.ts';
import { ListError } from '~/shared/List.tsx';
import { ChannelIntegrationList } from './ChannelIntegrations.tsx';
import { ChannelMembersTab, ChannelPipelinesTab, ChannelTemplatesTab } from './ChannelTabs.tsx';
import {
  type Channel,
  CHANNELS_PATH,
  useChannel,
  useChannelChange,
  useDeleteChannels,
} from './useChannels.ts';

/** The channel settings' sections, one address each. */
const SECTIONS = ['general', 'integrations', 'pipelines', 'members', 'templates'] as const;

type Section = (typeof SECTIONS)[number];

/** The section names, in the member's language. */
const useSectionNames = (): Record<Section, string> => {
  const { t } = useTranslation('frontline');

  return {
    general: t('general', 'General'),
    integrations: t('integrations', 'Integrations'),
    pipelines: t('pipelines', 'Pipelines'),
    members: t('members', 'Members'),
    templates: t('templates', 'Templates'),
  };
};

/** A section's frame: the raised card the channel's lists sit in. */
const Frame = ({ children }: { children: ReactNode }) => (
  <Card className="overflow-hidden">{children}</Card>
);

type Values = { name: string; description: string; icon: string };

/** The channel's icon, name and description: how it shows in the sidebar and the inbox. */
const GeneralFields = ({ disabled }: { disabled: boolean }) => {
  const { t } = useTranslation('frontline');
  const { control } = useFormContext<Values>();

  return (
    <Form.Section
      title={t('channel', 'Channel')}
      description={t(
        'channel-details-hint',
        'How the channel shows in the sidebar, the inbox and its tickets.',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="shrink-0 pt-6">
          <Form.Field
            control={control}
            name="icon"
            render={({ field }) => (
              <IconPicker
                aria-label={t('icon', 'Icon')}
                disabled={disabled}
                value={field.value}
                onValueChange={(icon) => icon && field.onChange(icon)}
              />
            )}
          />
        </div>
        <Form.Field
          control={control}
          name="name"
          rules={{
            validate: (name) => Boolean(name.trim()) || t('name-required', 'Enter a name'),
          }}
          render={({ field }) => (
            <Form.Item className="min-w-0 flex-1">
              <Form.Label required>{t('name', 'Name')}</Form.Label>
              <Form.Control>
                <Input {...field} maxLength={100} disabled={disabled} />
              </Form.Control>
              <Form.Message />
            </Form.Item>
          )}
        />
      </div>
      <Form.Field
        control={control}
        name="description"
        render={({ field }) => (
          <Form.Item>
            <Form.Label>{t('description', 'Description')}</Form.Label>
            <Form.Control>
              <Textarea {...field} rows={3} disabled={disabled} />
            </Form.Control>
          </Form.Item>
        )}
      />
    </Form.Section>
  );
};

/** The channel's name, description and icon in one form; Save sends them. */
const GeneralForm = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation('frontline');
  const disabled = !channel.canManage;

  const form = useForm<Values>({
    defaultValues: {
      name: channel.name,
      description: channel.description,
      icon: channel.icon ?? CHANNEL_ICON,
    },
  });

  const update = useMutation(orpc.channels.update.mutationOptions(useChannelChange()));

  const submit = form.handleSubmit((values) =>
    update.mutate(
      { id: channel.id, ...values, name: values.name.trim(), description: values.description },
      {
        onSuccess: (saved) => {
          form.reset({
            name: saved.name,
            description: saved.description,
            icon: saved.icon ?? CHANNEL_ICON,
          });
          toast({ variant: 'success', title: t('channel-saved', 'Channel saved') });
        },
      },
    ),
  );

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" noValidate onSubmit={(event) => void submit(event)}>
        <GeneralFields disabled={disabled} />
        {!disabled && <Form.SaveBar saving={update.isPending} />}
      </form>
    </Form>
  );
};

/** Deleting the channel, for its admins: its conversations, tickets and integrations go with it. */
const DeleteChannel = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();
  const { deleteChannels, isPending } = useDeleteChannels();

  return (
    <Form.Section
      variant="destructive"
      title={t('delete-channel', 'Delete channel')}
      description={t(
        'delete-channel-hint',
        'Its conversations, tickets, integrations and templates go with it. This cannot be undone.',
      )}
    >
      <Button
        variant="destructive"
        className="self-start"
        disabled={isPending}
        onClick={() => void deleteChannels([channel.id], () => void navigate(CHANNELS_PATH))}
      >
        <IconTrash />
        {t('delete-channel', 'Delete channel')}
      </Button>
    </Form.Section>
  );
};

/**
 * What brings conversations into the channel: its messengers, pages, bots and mailboxes. Its
 * admins add a messenger or connect an account here; the accounts themselves are a link away.
 */
const IntegrationsSection = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const canConnect = useCanConnect();

  return (
    <Form.Section
      title={t('integrations', 'Integrations')}
      description={t(
        'channel-integrations-hint',
        'Messengers, pages, bots and mailboxes that bring conversations into this channel.',
      )}
    >
      {channel.canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => openNew(INTEGRATION_TYPE, { channelId: channel.id })}
          >
            <IconMessageCirclePlus />
            {t('add-messenger', 'Add messenger')}
          </Button>
          {canConnect && <ConnectMenu channelId={channel.id} />}
          <span className="flex-1" />
          <Link
            to={`/${PLUGIN}/settings/accounts`}
            className={buttonVariants({ variant: 'ghost', tone: 'muted' })}
          >
            <IconLink />
            {t('connected-accounts', 'Connected accounts')}
          </Link>
        </div>
      )}
      <Frame>
        <ChannelIntegrationList channelId={channel.id} />
      </Frame>
    </Form.Section>
  );
};

/** The open section's body. */
const SectionBody = ({ section, channel }: { section: Section; channel: Channel }) => {
  switch (section) {
    case 'general':
      return (
        <>
          {/* A newer channel, saved here or elsewhere, starts the form again from it. */}
          <GeneralForm
            key={`${channel.name}|${channel.description}|${channel.icon ?? ''}`}
            channel={channel}
          />
          {channel.canManage && !channel.ownerId && <DeleteChannel channel={channel} />}
        </>
      );
    case 'integrations':
      return <IntegrationsSection channel={channel} />;
    case 'pipelines':
      return (
        <Frame>
          <ChannelPipelinesTab contentType={CHANNEL_TYPE} contentId={channel.id} />
        </Frame>
      );
    case 'members':
      return (
        <Frame>
          <ChannelMembersTab contentType={CHANNEL_TYPE} contentId={channel.id} />
        </Frame>
      );
    case 'templates':
      return (
        <Frame>
          <ChannelTemplatesTab contentType={CHANNEL_TYPE} contentId={channel.id} />
        </Frame>
      );
  }
};

/**
 * A channel's settings, inside the channel: its name and icon, the integrations that bring
 * conversations in, its ticket pipelines, its members and their saved replies, one section each.
 */
export const ChannelSettingsPage = () => {
  const { t } = useTranslation('frontline');
  const channelId = useChannelScope() ?? '';
  const { section: param } = useParams();
  const section = SECTIONS.find((one) => one === param) ?? 'general';
  const names = useSectionNames();
  const channel = useChannel(channelId);

  return (
    <PageContainer>
      <AppHeader
        icon={IconSettings}
        app={{ label: t('settings', 'Settings'), to: channelPath(channelId, 'settings') }}
        levels={[{ label: names[section] }]}
      />
      <ScrollArea className="flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
          <nav
            aria-label={t('channel-sections', 'Channel settings')}
            className="flex flex-wrap gap-1 border-b pb-2"
          >
            {SECTIONS.map((one) => (
              <Link
                key={one}
                to={channelPath(channelId, 'settings', one)}
                aria-current={section === one ? 'page' : undefined}
                className={buttonVariants({
                  size: 'sm',
                  variant: section === one ? 'secondary' : 'ghost',
                })}
              >
                {names[one]}
              </Link>
            ))}
          </nav>
          {channel.error ? (
            <ListError error={channel.error} retry={() => void channel.refetch()} />
          ) : !channel.data ? (
            <div className="flex flex-col gap-4" aria-busy>
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <SectionBody section={section} channel={channel.data} />
          )}
        </div>
      </ScrollArea>
    </PageContainer>
  );
};
