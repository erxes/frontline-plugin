import { IconHelp, IconLetterCase, IconListCheck, IconSelect } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  PanelFormLayout,
  PanelFormRow,
  StringArrayInput,
  Switch,
  type TRecordDraftProps,
  textOf,
} from 'erxes-ui';
import { type SubmitEvent, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { orpc } from '~/orpc.ts';
import { ChannelRow, useNewRecordChannel } from '~/shared/ChannelSelect.tsx';
import { draftsOf, useDiscard, useDraft } from '~/shared/drafts.ts';
import { TextRow } from '~/shared/TextRow.tsx';
import { useSurveyChange } from './useSurveys.ts';

/** The new survey being written, kept until it is created or thrown away. */
const surveyDrafts = draftsOf(
  'survey',
  z.object({
    channelId: z.string(),
    title: z.string(),
    question: z.string(),
    options: z.array(z.string()),
    allowMultiselect: z.boolean(),
  }),
);

type Draft = z.infer<typeof surveyDrafts.schema>;

type Save = (update: (current: Draft) => Draft) => void;

/** The first question's rows: what it asks, its options, and whether a voter picks several. */
const QuestionRows = ({ draft, save }: { draft: Draft; save: Save }) => {
  const { t } = useTranslation('frontline');
  const multiselectId = useId();

  return (
    <>
      <TextRow
        label={t('survey-question', 'Question')}
        icon={IconHelp}
        name="question"
        required
        defaultValue={draft.question}
        placeholder={t('survey-question-placeholder', 'What do you ask?')}
      />
      <PanelFormRow label={t('survey-options', 'Options')} icon={IconListCheck} required>
        <StringArrayInput
          value={draft.options}
          onValueChange={(options) => save((current) => ({ ...current, options }))}
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
          checked={draft.allowMultiselect}
          onCheckedChange={(allowMultiselect) =>
            save((current) => ({ ...current, allowMultiselect }))
          }
        />
      </PanelFormRow>
    </>
  );
};

/**
 * A new survey in core's side panel: its channel, title, and its first question with the options
 * visitors pick from. Nothing saves until Save; more questions are added on its builder page.
 */
export const SurveyNew = ({ defaults, onCreated, onCancel }: TRecordDraftProps) => {
  const { t } = useTranslation('frontline');

  const draft = useDraft(surveyDrafts, 'new', {
    channelId: textOf(defaults.channelId),
    title: '',
    question: '',
    options: [],
    allowMultiselect: false,
  });

  const { channelId: picked, title, question, options, allowMultiselect } = draft.value;
  const channelId = useNewRecordChannel(picked);
  const { onSuccess } = useSurveyChange();
  const discard = useDiscard(Boolean(title || question || options.length), draft.clear, onCancel);

  const create = useMutation(
    orpc.surveys.create.mutationOptions({
      onSuccess: (survey) => {
        draft.clear();
        onSuccess();
        onCreated(survey.id);
      },
    }),
  );

  return (
    <form
      // onSubmit rather than a form action, which would clear the fields when the API refuses them.
      onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        create.mutate({
          channelId,
          title,
          steps: [{ question, allowMultiselect, options: options.map((text) => ({ text })) }],
        });
      }}
      // What is typed is kept as it is typed, so a closed panel or a reload loses none of it.
      onChange={(event) => {
        const form = new FormData(event.currentTarget);

        draft.save((current) => ({
          ...current,
          title: textOf(form.get('title')),
          question: textOf(form.get('question')),
        }));
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <PanelFormLayout
        onCancel={() => void discard()}
        saving={create.isPending}
        saveLabel={t('create-survey', 'Create survey')}
      >
        <ChannelRow
          value={channelId}
          onChange={(id) => draft.save((current) => ({ ...current, channelId: id }))}
          missing={t('survey-channel-first', 'Be an admin of a channel to add a survey.')}
        />
        <TextRow
          label={t('title', 'Title')}
          icon={IconLetterCase}
          name="title"
          required
          defaultValue={title}
          placeholder={t('survey-title-placeholder', 'Name the survey for your team')}
        />
        <QuestionRows draft={draft.value} save={draft.save} />
        {create.error && (
          <p role="alert" className="text-xs text-destructive-text">
            {create.error.message}
          </p>
        )}
      </PanelFormLayout>
    </form>
  );
};
