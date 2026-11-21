import { IconInbox } from '@tabler/icons-react';
import { useIntegrationChange } from '@/inbox/queries.ts';
import { useMutation } from '@tanstack/react-query';
import { Form, PageContainer, ScrollArea, Skeleton, toast } from 'erxes-ui';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { orpc } from '~/orpc.ts';
import { PLUGIN } from '~/plugin.ts';
import { AppHeader } from '~/shared/Header.tsx';
import { SaveBar } from '~/shared/Settings.tsx';
import { AppearanceCard } from './AppearanceCard.tsx';
import { AvailabilityCard } from './AvailabilityCard.tsx';
import { BehaviourCard } from './BehaviourCard.tsx';
import { BotCard } from './BotCard.tsx';
import { FaqCard } from './FaqCard.tsx';
import { GreetingCard } from './GreetingCard.tsx';
import { InstallCard } from './InstallCard.tsx';
import { MessengerPreview } from './MessengerPreview.tsx';
import { type MessengerSettings, useMessengerSettings } from './queries.ts';
import { TicketsCard } from './TicketsCard.tsx';

/** The page's one form: every card, the preview beside them, and one Save under them. */
const SettingsForm = ({ messenger }: { messenger: MessengerSettings }) => {
  const { t } = useTranslation('frontline');
  const change = useIntegrationChange();
  const form = useForm({ defaultValues: messenger.config });

  const update = useMutation(
    orpc.integrations.update.mutationOptions({
      ...change,
      onSuccess: () => {
        form.reset(form.getValues());
        change.onSuccess();
        toast({ title: t('messenger-saved', 'Messenger saved') });
      },
    }),
  );

  const save = form.handleSubmit((config) => update.mutate({ id: messenger.id, config }));

  return (
    <Form {...form}>
      <form onSubmit={(event) => void save(event)} className="flex flex-col gap-6 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <InstallCard messenger={messenger} />
          <fieldset disabled={!messenger.canManage} className="contents">
            <GreetingCard />
            <AppearanceCard />
            <AvailabilityCard />
            <BehaviourCard />
            <BotCard />
            <FaqCard />
            <TicketsCard channelId={messenger.channelId} />
          </fieldset>
          {messenger.canManage && (
            <SaveBar
              dirty={form.formState.isDirty}
              saving={update.isPending}
              onDiscard={() => form.reset()}
            />
          )}
        </div>
        <MessengerPreview messenger={messenger} />
      </form>
    </Form>
  );
};

/**
 * A messenger's settings on their own page, laid out like core's settings pages: cards in one
 * form, a live preview beside them, and one Save. Members who can't manage its channel read them.
 */
export const MessengerSettingsPage = () => {
  const { t } = useTranslation('frontline');
  const { data, error } = useMessengerSettings(useParams().id ?? '');

  return (
    <PageContainer>
      <AppHeader
        icon={IconInbox}
        app={{ label: t('inbox', 'Inbox'), to: `/${PLUGIN}/inbox` }}
        levels={[{ label: data?.name ?? t('messenger', 'Messenger') }]}
      />
      <ScrollArea>
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-6">
          {error ? (
            <p role="alert" className="text-sm text-destructive-text">
              {error.message}
            </p>
          ) : data ? (
            <SettingsForm key={data.id} messenger={data} />
          ) : (
            <Skeleton className="h-60" />
          )}
        </div>
      </ScrollArea>
    </PageContainer>
  );
};
