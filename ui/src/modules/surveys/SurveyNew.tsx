import { IconHelp, IconLetterCase, IconListCheck, IconSelect } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  PanelFormLayout,
  PanelFormRow,
  StringArrayInput,
  Switch,
  type TRecordDraftProps,
} from 'erxes-ui';
import { type SubmitEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { ChannelRow, useManagedChannels } from '~/shared/ChannelSelect.tsx';
import { textOf } from '~/shared/hooks.ts';
import { TextRow } from '~/shared/TextRow.tsx';
import { useSurveyChange } from './useSurveys.ts';

/** The first question's rows: what it asks, its options, and whether a voter picks several. */
const QuestionRows = ({
  options,
  onOptionsChange,
  allowMultiselect,
  onMultiselectChange,
}: {
  options: string[];
  onOptionsChange: (options: string[]) => void;
  allowMultiselect: boolean;
  onMultiselectChange: (allowMultiselect: boolean) => void;
}) => {
  const { t } = useTranslation('frontline');
  const multiselectId = useId();

  return (
    <>
      <TextRow
        label={t('survey-question', 'Question')}
        icon={IconHelp}
        name="question"
        required
        placeholder={t('survey-question-placeholder', 'What do you ask?')}
      />
      <PanelFormRow label={t('survey-options', 'Options')} icon={IconListCheck} required>
        <StringArrayInput
          value={options}
          onValueChange={onOptionsChange}
          placeholder={t('survey-add-option', 'Type an option and press Enter')}
        />
      </PanelFormRow>
      <PanelFormRow
        label={t('survey-multiselect', 'Several picks')}
        icon={IconSelect}
        htmlFor={multiselectId}
      >
        <Switch
          id={multiselectId}
          aria-label={t('survey-multiselect', 'Several picks')}
          checked={allowMultiselect}
          onCheckedChange={onMultiselectChange}
        />
      </PanelFormRow>
    </>
  );
};

/**
 * A new survey in core's side panel: its channel, title, and its first question with the options
 * visitors pick from. Nothing saves until Save; more questions are added on its Questions tab.
 */
export const SurveyNew = ({ defaults, onCreated, onCancel }: TRecordDraftProps) => {
  const { t } = useTranslation('frontline');
  const first = useManagedChannels()[0]?.id ?? '';
  const [picked, setChannelId] = useState(() => textOf(defaults.channelId));
  const [options, setOptions] = useState<string[]>([]);
  const [allowMultiselect, setMultiselect] = useState(false);
  const channelId = picked || first;
  const { onSuccess } = useSurveyChange();

  const create = useMutation(
    orpc.surveys.create.mutationOptions({
      onSuccess: async (survey) => {
        await onSuccess();
        onCreated(survey.id);
      },
    }),
  );

  // onSubmit rather than a form action, which would clear the fields when the API refuses them.
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    create.mutate({
      channelId,
      title: textOf(form.get('title')),
      steps: [
        {
          question: textOf(form.get('question')),
          allowMultiselect,
          options: options.map((text) => ({ text })),
        },
      ],
    });
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <PanelFormLayout
        onCancel={onCancel}
        saving={create.isPending}
        saveLabel={t('create-survey', 'Create survey')}
      >
        <ChannelRow
          value={channelId}
          onChange={setChannelId}
          missing={t('survey-channel-first', 'Be an admin of a channel to add a survey.')}
        />
        <TextRow
          label={t('title', 'Title')}
          icon={IconLetterCase}
          name="title"
          required
          placeholder={t('survey-title-placeholder', 'Name the survey for your team')}
        />
        <QuestionRows
          options={options}
          onOptionsChange={setOptions}
          allowMultiselect={allowMultiselect}
          onMultiselectChange={setMultiselect}
        />
        {create.error && (
          <p role="alert" className="text-xs text-destructive-text">
            {create.error.message}
          </p>
        )}
      </PanelFormLayout>
    </form>
  );
};
