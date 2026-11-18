import { useQuery } from '@tanstack/react-query';
import type { TRecordSlotProps } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { WithSurvey } from './SurveyPanel.tsx';
import type { Survey } from './useSurveys.ts';

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
