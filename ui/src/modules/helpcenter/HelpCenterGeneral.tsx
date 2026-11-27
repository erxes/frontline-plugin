import { useMutation } from '@tanstack/react-query';
import { Form, Input, Textarea, toast } from 'erxes-ui';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { LanguageSelect } from '@/knowledgebase/LanguageSelect.tsx';
import { orpc } from '~/orpc.ts';
import { PickerSelect } from '~/shared/Pickers.tsx';
import { DangerCard, SaveBar, SettingField, SettingsCard } from '~/shared/Settings.tsx';
import { FormsField, MessengerField } from './SiteOffers.tsx';
import {
  type HelpCenter,
  HELP_CENTERS_PATH,
  useDeleteHelpCenters,
  useHelpCenterChange,
  useTopicOptions,
} from './queries.ts';

export type GeneralValues = {
  title: string;
  description: string;
  languageCode: string | null;
  kbTopicId: string | null;
  kbLabel: string;
  formIds: string[];
  messengerId: string | null;
};

const valuesOf = (center: HelpCenter): GeneralValues => ({
  title: center.title,
  description: center.description ?? '',
  languageCode: center.languageCode,
  kbTopicId: center.kbTopicId,
  kbLabel: center.kbLabel ?? '',
  formIds: center.formIds,
  messengerId: center.messengerId,
});

/** What the help center is called and the language its site prints its own words in. */
const AboutCard = () => {
  const { t } = useTranslation('frontline');

  return (
    <SettingsCard
      title={t('help-center', 'Help center')}
      description={t(
        'hc-about-description',
        'What the site is called and the language it reads in.',
      )}
    >
      <SettingField<GeneralValues, 'title'>
        name="title"
        label={t('title', 'Title')}
        required
        rules={{
          validate: (title) => Boolean(title.trim()) || t('title-required', 'Enter a title'),
        }}
      >
        {(field) => <Input {...field} maxLength={200} />}
      </SettingField>
      <SettingField<GeneralValues, 'languageCode'>
        name="languageCode"
        label={t('language', 'Language')}
      >
        {(field) => <LanguageSelect value={field.value} onChange={field.onChange} />}
      </SettingField>
      <SettingField<GeneralValues, 'description'>
        name="description"
        label={t('description', 'Description')}
        wide
      >
        {(field) => <Textarea {...field} rows={3} />}
      </SettingField>
    </SettingsCard>
  );
};

/** The knowledge base topic the site shows, and what its tab is called. */
const KnowledgeBaseCard = () => {
  const { t } = useTranslation('frontline');
  const topics = useTopicOptions();

  return (
    <SettingsCard
      title={t('knowledge-base', 'Knowledge base')}
      description={t('hc-kb-description', 'The topic whose articles the site shows.')}
    >
      <SettingField<GeneralValues, 'kbTopicId'>
        name="kbTopicId"
        label={t('kb-topic', 'Knowledge base topic')}
        bare
      >
        {(field) => (
          <PickerSelect
            label={t('kb-topic', 'Knowledge base topic')}
            placeholder={t('none', 'None')}
            display={
              <span className="truncate">
                {topics.find((topic) => topic.value === field.value)?.label}
              </span>
            }
            options={topics}
            value={field.value ? [field.value] : []}
            onValueChange={([kbTopicId]) => field.onChange(kbTopicId ?? null)}
            noneLabel={t('none', 'None')}
          />
        )}
      </SettingField>
      <SettingField<GeneralValues, 'kbLabel'>
        name="kbLabel"
        label={t('kb-label', 'Knowledge base label')}
      >
        {(field) => <Input {...field} placeholder={t('knowledge-base', 'Knowledge base')} />}
      </SettingField>
    </SettingsCard>
  );
};

/**
 * The help center's name, language, topic, forms and messenger in one form with one Save;
 * members who can't manage help centers read them.
 */
export const HelpCenterGeneral = ({
  center,
  editable,
}: {
  center: HelpCenter;
  editable: boolean;
}) => {
  const { t } = useTranslation('frontline');
  const change = useHelpCenterChange();
  const form = useForm({ defaultValues: valuesOf(center) });

  const update = useMutation(
    orpc.helpCenters.update.mutationOptions({
      ...change,
      onSuccess: (saved) => {
        form.reset(valuesOf(saved));
        change.onSuccess();
        toast({ title: t('help-center-saved', 'Help center saved') });
      },
    }),
  );

  const save = form.handleSubmit((values) =>
    update.mutate({
      id: center.id,
      ...values,
      title: values.title.trim(),
      description: values.description.trim() || null,
      kbLabel: values.kbLabel.trim() || null,
    }),
  );

  return (
    <Form {...form}>
      <form onSubmit={(event) => void save(event)} className="flex flex-col gap-4">
        <fieldset disabled={!editable} className="contents">
          <AboutCard />
          <KnowledgeBaseCard />
          <SettingsCard
            title={t('hc-offers', 'Forms and tickets')}
            description={t(
              'hc-offers-description',
              'What visitors can send from the site, and where they follow it.',
            )}
          >
            <FormsField />
            <MessengerField />
          </SettingsCard>
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
  );
};

/** Deletes the help center, its address and its domain, then goes back to the list. */
export const DeleteHelpCenter = ({ center }: { center: HelpCenter }) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();
  const { deleteCenters, isPending } = useDeleteHelpCenters();

  return (
    <DangerCard
      title={t('delete-help-center', 'Delete help center')}
      description={t(
        'delete-help-center-description',
        'Its address and domain stop working. The knowledge base and forms stay.',
      )}
      disabled={isPending}
      onDelete={() => void deleteCenters([center.id], () => void navigate(HELP_CENTERS_PATH))}
    />
  );
};
