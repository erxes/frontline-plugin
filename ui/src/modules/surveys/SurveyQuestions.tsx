import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Label,
  StringArrayInput,
  Switch,
  TextField,
  type TRecordSlotProps,
} from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { WithSurvey } from './SurveyPanel.tsx';
import { type StepInput, type Survey, type SurveyStep, useEditSurvey } from './useSurveys.ts';

/** The options as typed, keeping the id of each one already there so its votes stay with it. */
const optionsOf = (step: SurveyStep, texts: string[]) =>
  texts.map(
    (text) =>
      step.options.find((option) => option.text.toLowerCase() === text.toLowerCase()) ?? {
        text,
      },
  );

/** One question: what it asks, the options and whether a voter picks several. */
const StepCard = ({
  survey,
  step,
  save,
}: {
  survey: Survey;
  step: SurveyStep;
  save: (step: StepInput | null) => void;
}) => {
  const { t } = useTranslation('frontline');
  const multiselectId = `frontline-survey-${step.id}-multiselect`;
  // Held here as typed, so an option entered before the last one's save returns isn't lost.
  const [texts, setTexts] = useState(() => step.options.map((option) => option.text));

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-background p-4">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-sm font-medium">
          <TextField
            scope={`frontline-survey.${survey.id}.${step.id}.question`}
            value={step.question}
            placeholder={t('survey-question', 'Question')}
            onSave={(question) => {
              const next = question.trim();

              if (next && next !== step.question) save({ ...step, question: next });
            }}
          />
        </span>
        {survey.canManage && survey.steps.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('survey-remove-question', 'Remove {{question}}', {
              question: step.question,
            })}
            onClick={() => save(null)}
          >
            <IconTrash />
          </Button>
        )}
      </div>
      <StringArrayInput
        value={texts}
        onValueChange={(next) => {
          setTexts(next);
          save({ ...step, options: optionsOf(step, next) });
        }}
        placeholder={t('survey-add-option', 'Type an option and press Enter')}
      />
      <div className="flex items-center gap-2">
        <Switch
          id={multiselectId}
          checked={step.allowMultiselect}
          onCheckedChange={(allowMultiselect) => save({ ...step, allowMultiselect })}
        />
        <Label htmlFor={multiselectId}>{t('survey-multiselect', 'Several picks')}</Label>
      </div>
    </section>
  );
};

const Questions = ({ survey }: { survey: Survey }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditSurvey(survey.id);

  return (
    <fieldset disabled={!survey.canManage} className="flex flex-col gap-3 p-3">
      {survey.steps.map((step, index) => (
        <StepCard
          key={step.id}
          survey={survey}
          step={step}
          save={(next) =>
            edit({
              steps: survey.steps.flatMap((each, at) =>
                at !== index ? [each] : next ? [next] : [],
              ),
            })
          }
        />
      ))}
      {survey.canManage && survey.steps.length < 10 && (
        <Button
          variant="ghost"
          className="self-start"
          onClick={() =>
            edit({
              steps: [
                ...survey.steps,
                {
                  question: t('survey-new-question', 'New question'),
                  options: [{ text: t('yes', 'Yes') }, { text: t('no', 'No') }],
                },
              ],
            })
          }
        >
          <IconPlus />
          {t('survey-add-question', 'Add question')}
        </Button>
      )}
    </fieldset>
  );
};

/** The Questions tab: each question and its options, saved as each changes. */
export const SurveyQuestions = ({ contentId }: TRecordSlotProps) => (
  <WithSurvey contentId={contentId} render={(survey) => <Questions survey={survey} />} />
);

const Results = ({ survey }: { survey: Survey }) => {
  const { t } = useTranslation('frontline');
  const results = useQuery(orpc.surveys.results.queryOptions({ input: { id: survey.id } }));
  const voters = results.data?.voterCount ?? 0;

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-sm text-muted-foreground">
        {t('survey-voter-count', { defaultValue: '{{count}} voters', count: voters })}
      </p>
      {survey.steps.map((step) => (
        <section key={step.id} className="flex flex-col gap-2 rounded-lg border bg-background p-4">
          <h3 className="text-sm font-medium">{step.question}</h3>
          {step.options.map((option) => {
            const votes = results.data?.options[option.id] ?? 0;
            const percent = voters ? Math.round((votes / voters) * 100) : 0;

            return (
              <div key={option.id} className="flex flex-col gap-1 text-xs">
                <span className="flex justify-between gap-2">
                  <span>{option.text}</span>
                  <span className="text-muted-foreground">
                    {t('survey-option-votes', '{{votes}} · {{percent}}%', { votes, percent })}
                  </span>
                </span>
                <progress className="h-1.5 w-full" value={votes} max={Math.max(voters, 1)}>
                  {percent}%
                </progress>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
};

/** The Results tab: how many voted, and each option's share. */
export const SurveyResults = ({ contentId }: TRecordSlotProps) => (
  <WithSurvey contentId={contentId} render={(survey) => <Results survey={survey} />} />
);
