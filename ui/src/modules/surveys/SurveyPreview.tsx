import { Button, Checkbox, Label, RadioGroup } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DevicePreview } from '~/shared/DevicePreview.tsx';
import type { Survey, SurveyStep } from './useSurveys.ts';

/** One question's options, one pick or several, kept in the preview only. */
const Choices = ({
  step,
  picked,
  onChange,
}: {
  step: SurveyStep;
  picked: string[];
  onChange: (picked: string[]) => void;
}) =>
  step.allowMultiselect ? (
    <div className="flex flex-col gap-1">
      {step.options.map((option) => (
        <div key={option.id} className="flex items-center gap-2">
          <Checkbox
            id={`${step.id}-${option.id}`}
            checked={picked.includes(option.id)}
            onCheckedChange={(checked) =>
              onChange(checked ? [...picked, option.id] : picked.filter((one) => one !== option.id))
            }
          />
          <Label htmlFor={`${step.id}-${option.id}`}>{option.text}</Label>
        </div>
      ))}
    </div>
  ) : (
    <RadioGroup
      aria-label={step.question}
      value={picked[0] ?? ''}
      onValueChange={(value) => onChange([value])}
    >
      {step.options.map((option) => (
        <div key={option.id} className="flex items-center gap-2">
          <RadioGroup.Item id={`${step.id}-${option.id}`} value={option.id} />
          <Label htmlFor={`${step.id}-${option.id}`}>{option.text}</Label>
        </div>
      ))}
    </RadioGroup>
  );

/** The survey as a voter reads it, each question with its options, on a desktop, tablet or phone. */
export const SurveyPreview = ({ survey }: { survey: Survey }) => {
  const { t } = useTranslation('frontline');
  const [picks, setPicks] = useState<Record<string, string[]>>({});

  return (
    <DevicePreview>
      <section
        aria-label={t('preview', 'Preview')}
        className="flex flex-col gap-4 rounded-lg border bg-background p-4"
      >
        <h2 className="text-base font-semibold">{survey.title}</h2>
        {survey.steps.map((step) => (
          <div key={step.id} className="flex flex-col gap-2">
            <p className="text-sm font-medium">{step.question}</p>
            {step.description && (
              <p className="text-xs text-muted-foreground">{step.description}</p>
            )}
            <Choices
              step={step}
              picked={picks[step.id] ?? []}
              onChange={(picked) => setPicks((current) => ({ ...current, [step.id]: picked }))}
            />
          </div>
        ))}
        <Button disabled className="self-start">
          {t('survey-vote', 'Vote')}
        </Button>
      </section>
    </DevicePreview>
  );
};
