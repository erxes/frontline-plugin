import { useMutation } from '@tanstack/react-query';
import { ColorPicker, Form, Input, Textarea, toast } from 'erxes-ui';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { orpc } from '~/orpc.ts';
import { ImageField } from '~/shared/Files.tsx';
import { DangerCard, SaveBar, SettingField, SettingsCard } from '~/shared/Settings.tsx';
import { LanguageSelect } from './LanguageSelect.tsx';
import { useDeleteTopics } from './useKbDeletes.ts';
import { KB_PATH, type Topic, useKbChange } from './useKnowledgeBase.ts';

/** What the page's form edits; an empty colour or image is unset. */
type Values = {
  title: string;
  description: string;
  code: string;
  languageCode: string | null;
  color: string;
  backgroundImage: string;
};

const valuesOf = (topic: Topic): Values => ({
  title: topic.title,
  description: topic.description ?? '',
  code: topic.code ?? '',
  languageCode: topic.languageCode,
  color: topic.color ?? '',
  backgroundImage: topic.backgroundImage ?? '',
});

/** What the topic is called, what it covers, and the code a site asks for it by. */
const TopicCard = () => {
  const { t } = useTranslation('frontline');

  return (
    <SettingsCard
      title={t('kb-topic', 'Topic')}
      description={t('kb-topic-description', 'What the topic is called and what it covers.')}
    >
      <SettingField<Values, 'title'>
        name="title"
        label={t('title', 'Title')}
        required
        rules={{
          validate: (title) => Boolean(title.trim()) || t('title-required', 'Enter a title'),
        }}
      >
        {(field) => <Input {...field} maxLength={200} />}
      </SettingField>
      <SettingField<Values, 'code'>
        name="code"
        label={t('code', 'Code')}
        hint={t('kb-code-hint', 'A short name a website can ask for the topic by.')}
      >
        {(field) => <Input {...field} />}
      </SettingField>
      <SettingField<Values, 'description'>
        name="description"
        label={t('description', 'Description')}
        wide
      >
        {(field) => <Textarea {...field} rows={3} />}
      </SettingField>
    </SettingsCard>
  );
};

/** How the topic's published help center reads: its language, colour and background image. */
const HelpCenterCard = () => {
  const { t } = useTranslation('frontline');

  return (
    <SettingsCard
      title={t('kb-help-center', 'Help center')}
      description={t(
        'kb-help-center-description',
        'How the published help center of this topic reads and looks.',
      )}
    >
      <SettingField<Values, 'languageCode'> name="languageCode" label={t('language', 'Language')}>
        {(field) => <LanguageSelect value={field.value} onChange={field.onChange} />}
      </SettingField>
      <SettingField<Values, 'color'> name="color" label={t('kb-color', 'Color')}>
        {(field) => (
          <ColorPicker
            aria-label={t('kb-color', 'Color')}
            value={field.value || undefined}
            onValueChange={field.onChange}
            className="w-16"
          />
        )}
      </SettingField>
      <SettingField<Values, 'backgroundImage'>
        name="backgroundImage"
        label={t('kb-background-image', 'Background image')}
        wide
        bare
      >
        {(field) => (
          <ImageField value={field.value} onChange={(file) => field.onChange(file?.url ?? '')} />
        )}
      </SettingField>
    </SettingsCard>
  );
};

/**
 * A topic's settings, laid out like core's settings pages: one form and one Save, then deleting
 * it. Members without the topics permission read them and change nothing.
 */
export const TopicSettings = ({ topic, editable }: { topic: Topic; editable: boolean }) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();
  const change = useKbChange();
  const form = useForm({ defaultValues: valuesOf(topic) });
  const { deleteTopics, isPending: deleting } = useDeleteTopics();

  const update = useMutation(
    orpc.knowledgebase.topics.update.mutationOptions({
      ...change,
      onSuccess: (saved) => {
        form.reset(valuesOf(saved));
        change.onSuccess();
        toast({ title: t('kb-topic-saved', 'Topic saved') });
      },
    }),
  );

  const save = form.handleSubmit((values) =>
    update.mutate({
      id: topic.id,
      ...values,
      title: values.title.trim(),
      color: values.color || null,
    }),
  );

  return (
    <>
      <Form {...form}>
        <form onSubmit={(event) => void save(event)} className="flex flex-col gap-4">
          <fieldset disabled={!editable} className="contents">
            <TopicCard />
            <HelpCenterCard />
          </fieldset>
          {editable && (
            <SaveBar
              dirty={form.formState.isDirty}
              saving={update.isPending}
              onDiscard={() => form.reset()}
            />
          )}
        </form>
      </Form>
      {editable && (
        <DangerCard
          title={t('kb-delete-topic', 'Delete topic')}
          description={t(
            'kb-delete-topic-description',
            'Deleting this topic removes all of its categories and articles.',
          )}
          disabled={deleting}
          onDelete={() => void deleteTopics([topic.id], () => void navigate(KB_PATH))}
        />
      )}
    </>
  );
};
