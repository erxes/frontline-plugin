import { IconTrash } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Button, ColorPicker, Form, PageContainer, ScrollArea, Skeleton, toast } from 'erxes-ui';
import type { ReactNode } from 'react';
import { useForm, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { orpc } from '~/orpc.ts';
import { ImageField } from './Files.tsx';
import { KbHeader } from './KbHeader.tsx';
import { LanguageSelect } from './LanguageSelect.tsx';
import { useDeleteTopics } from './useKbDeletes.ts';
import { KB_PATH, type Topic, useKbAccess, useKbChange, useTopic } from './useKnowledgeBase.ts';

/** What the help center card edits; an empty colour or image is unset. */
type HelpCenter = { languageCode: string | null; color: string; backgroundImage: string };

const valuesOf = (topic: Topic): HelpCenter => ({
  languageCode: topic.languageCode,
  color: topic.color ?? '',
  backgroundImage: topic.backgroundImage ?? '',
});

/** One card of the page: a title, a line saying what it's for, then its fields. */
const Card = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <section className="space-y-4 rounded-lg border bg-background p-5">
    <div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
    {children}
  </section>
);

/** How the topic's help center reads: its language, colour and background image. */
const HelpCenterForm = ({ topic, editable }: { topic: Topic; editable: boolean }) => {
  const { t } = useTranslation('frontline');
  const change = useKbChange();

  const form = useForm({ defaultValues: valuesOf(topic) });

  const update = useMutation(
    orpc.knowledgebase.topics.update.mutationOptions({
      ...change,
      onSuccess: async (saved) => {
        form.reset(valuesOf(saved));
        await change.onSuccess();
        toast({ title: t('kb-topic-saved', 'Topic saved') });
      },
    }),
  );

  const save = form.handleSubmit((values) =>
    update.mutate({
      id: topic.id,
      languageCode: values.languageCode,
      color: values.color || null,
      backgroundImage: values.backgroundImage,
    }),
  );

  return (
    <Form {...form}>
      <form onSubmit={(event) => void save(event)} className="flex flex-col gap-4">
        <fieldset disabled={!editable} className="contents">
          <HelpCenterCard />
        </fieldset>
        {editable && (
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
      </form>
    </Form>
  );
};

/** The help center card's fields, in the page's one form. */
const HelpCenterCard = () => {
  const { t } = useTranslation('frontline');
  const { control } = useFormContext<HelpCenter>();

  return (
    <Card
      title={t('kb-help-center', 'Help center')}
      description={t(
        'kb-help-center-description',
        'How the published help center of this topic reads and looks.',
      )}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Form.Field
          control={control}
          name="languageCode"
          render={({ field }) => (
            <Form.Item>
              <Form.Label>{t('language', 'Language')}</Form.Label>
              <Form.Control>
                <LanguageSelect value={field.value} onChange={field.onChange} />
              </Form.Control>
              <Form.Message />
            </Form.Item>
          )}
        />
        <Form.Field
          control={control}
          name="color"
          render={({ field }) => (
            <Form.Item>
              <Form.Label>{t('kb-color', 'Color')}</Form.Label>
              <Form.Control>
                <ColorPicker
                  aria-label={t('kb-color', 'Color')}
                  value={field.value || undefined}
                  onValueChange={field.onChange}
                  className="w-min"
                />
              </Form.Control>
              <Form.Message />
            </Form.Item>
          )}
        />
      </div>
      <Form.Field
        control={control}
        name="backgroundImage"
        render={({ field }) => (
          <Form.Item>
            <Form.Label>{t('kb-background-image', 'Background image')}</Form.Label>
            <ImageField value={field.value} onChange={(file) => field.onChange(file?.url ?? '')} />
            <Form.Message />
          </Form.Item>
        )}
      />
    </Card>
  );
};

/** Deletes the topic with its categories and articles, then goes back to the topics. */
const DeleteTopic = ({ topic }: { topic: Topic }) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();
  const { deleteTopics, isPending } = useDeleteTopics();

  return (
    <Card
      title={t('kb-delete-topic', 'Delete topic')}
      description={t(
        'kb-delete-topic-description',
        'Deleting this topic removes all of its categories and articles.',
      )}
    >
      <Button
        variant="secondary"
        tone="destructive"
        disabled={isPending}
        onClick={() => void deleteTopics([topic.id], () => void navigate(KB_PATH))}
      >
        <IconTrash />
        {t('kb-delete-topic', 'Delete topic')}
      </Button>
    </Card>
  );
};

/**
 * A topic's help center settings, laid out like core's settings pages: one centered column of
 * cards and one Save. Members without the topics permission read them and change nothing.
 */
export const TopicSettingsPage = () => {
  const { t } = useTranslation('frontline');
  const topicId = useParams().topicId ?? '';
  const can = useKbAccess();
  const { data, error } = useTopic(topicId);

  return (
    <PageContainer>
      <KbHeader topicId={topicId} label={t('settings', 'Settings')} />
      <ScrollArea>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
          {error ? (
            <p className="text-sm text-destructive-text">{error.message}</p>
          ) : data ? (
            <>
              <HelpCenterForm key={data.id} topic={data} editable={can.topics} />
              {can.topics && <DeleteTopic topic={data} />}
            </>
          ) : (
            <Skeleton className="h-60" />
          )}
        </div>
      </ScrollArea>
    </PageContainer>
  );
};
