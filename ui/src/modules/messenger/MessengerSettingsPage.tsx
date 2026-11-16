import { IconInbox } from '@tabler/icons-react';
import { useIntegrationChange } from '@/inbox/queries.ts';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  buttonVariants,
  Form,
  PageContainer,
  PageHeader,
  ScrollArea,
  Separator,
  Skeleton,
  toast,
} from 'erxes-ui';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { orpc } from '~/orpc.ts';
import { PLUGIN } from '~/plugin.ts';
import { AppearanceCard } from './AppearanceCard.tsx';
import { AvailabilityCard } from './AvailabilityCard.tsx';
import { BehaviourCard } from './BehaviourCard.tsx';
import { BotCard } from './BotCard.tsx';
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
      onSuccess: async () => {
        form.reset(form.getValues());
        await change.onSuccess();
        toast({ title: t('messenger-saved', 'Messenger saved') });
      },
    }),
  );

  const save = form.handleSubmit((config) => update.mutate({ id: messenger.id, config }));

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => void save(event)}
        className="grid grid-cols-1 gap-4 lg:grid-cols-3"
      >
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          {messenger.scriptUrl && <InstallCard scriptUrl={messenger.scriptUrl} />}
          <fieldset disabled={!messenger.canManage} className="contents">
            <GreetingCard />
            <AppearanceCard />
            <AvailabilityCard />
            <BehaviourCard />
            <BotCard />
            <TicketsCard channelId={messenger.channelId} />
          </fieldset>
          {messenger.canManage && (
            <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background/95 py-3 backdrop-blur">
              <Button
                type="button"
                variant="ghost"
                disabled={!form.formState.isDirty}
                onClick={() => form.reset()}
              >
                {t('discard', 'Discard')}
              </Button>
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? t('saving', 'Saving…') : t('save', 'Save')}
              </Button>
            </div>
          )}
        </div>
        <MessengerPreview />
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
      <PageHeader>
        <PageHeader.Start>
          <Link to={`/${PLUGIN}/inbox`} className={buttonVariants({ variant: 'ghost' })}>
            <IconInbox />
            {t('inbox', 'Inbox')}
          </Link>
          <Separator.Inline />
          <span className="flex h-8 items-center px-3 text-sm font-medium">
            {data?.name ?? t('messenger', 'Messenger')}
          </span>
        </PageHeader.Start>
      </PageHeader>
      <ScrollArea>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
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
