import { isShown } from '@frontline/api/logic';
import { Button, Checkbox, cn, Input, Label, RadioGroup, Select, Switch, Textarea } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PICK_TYPES } from './fieldTypes.ts';
import type { Form, FormField } from './useForms.ts';

declare module 'react' {
  interface CSSProperties {
    '--form-color'?: string;
  }
}

type Answers = Record<string, unknown>;

/** One field as a visitor fills it in, keeping the answer in the preview only. */
const PreviewInput = ({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
}) => {
  const text = typeof value === 'string' ? value : '';
  const label = field.label ?? '';

  if (field.type === 'textarea')
    return (
      <Textarea
        aria-label={label}
        placeholder={field.placeholder ?? ''}
        value={text}
        onChange={(event) => onChange(event.target.value)}
      />
    );

  if (field.type === 'boolean')
    return <Switch aria-label={label} checked={value === true} onCheckedChange={onChange} />;

  if (field.type === 'select')
    return (
      <Select value={text} onValueChange={onChange}>
        <Select.Trigger aria-label={label}>
          <Select.Value placeholder={field.placeholder ?? ''} />
        </Select.Trigger>
        <Select.Content>
          {field.options.map((option) => (
            <Select.Item key={option} value={option}>
              {option}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
    );

  if (field.type === 'radio')
    return (
      <RadioGroup aria-label={label} value={text} onValueChange={onChange}>
        {field.options.map((option, index) => (
          <div key={option} className="flex items-center gap-2">
            <RadioGroup.Item id={`${field.id}-${index}`} value={option} />
            <Label htmlFor={`${field.id}-${index}`}>{option}</Label>
          </div>
        ))}
      </RadioGroup>
    );

  if (field.type === 'check') {
    const picked = Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];

    return (
      <div className="flex flex-col gap-1">
        {field.options.map((option, index) => (
          <div key={option} className="flex items-center gap-2">
            <Checkbox
              id={`${field.id}-${index}`}
              checked={picked.includes(option)}
              onCheckedChange={(checked) =>
                onChange(checked ? [...picked, option] : picked.filter((item) => item !== option))
              }
            />
            <Label htmlFor={`${field.id}-${index}`}>{option}</Label>
          </div>
        ))}
      </div>
    );
  }

  const type = field.type === 'number' ? 'number' : field.type.endsWith('ate') ? 'date' : 'text';

  return (
    <Input
      aria-label={label}
      type={type}
      disabled={field.type === 'file' || field.type === 'core:customer:avatar'}
      placeholder={field.placeholder ?? ''}
      value={text}
      onChange={(event) => onChange(event.target.value)}
    />
  );
};

/** A field with its label and help text, across the form or, at half width, beside another. */
const PreviewField = ({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <div className={cn('flex flex-col gap-1.5', field.column === 1 ? 'col-span-1' : 'col-span-2')}>
      <Label>
        {field.label || t('field-untitled', 'Untitled field')}
        {field.isRequired && ' *'}
      </Label>
      <PreviewInput field={field} value={value} onChange={onChange} />
      {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
      {PICK_TYPES.includes(field.type) && field.options.length === 0 && (
        <p className="text-xs text-muted-foreground">{t('field-no-options', 'No options yet')}</p>
      )}
    </div>
  );
};

/**
 * The form as a visitor sees it, a step at a time, with the show and hide rules applied to what
 * is typed here: the same rules the API checks a submission by (`api/src/modules/forms/logic.ts`).
 */
/**
 * The button a visitor presses, in the form's colour with white text as the embed draws it, or
 * the theme's primary when the form has none. It only shows, so it is no button here.
 */
export const FormButton = ({ form, label }: { form: Form; label: string }) => (
  <span
    style={form.primaryColor ? { '--form-color': form.primaryColor } : undefined}
    className={cn(
      'inline-flex h-8 items-center self-start rounded-md px-3 text-sm font-medium',
      form.primaryColor ? 'bg-(--form-color) text-white' : 'bg-primary text-primary-foreground',
    )}
  >
    {label}
  </span>
);

export const FormPreview = ({ form, fields }: { form: Form; fields: FormField[] }) => {
  const { t } = useTranslation('frontline');
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState(1);
  const steps = Math.max(form.steps.length, 1);
  const shown = fields.filter((field) => field.pageNumber === step && isShown(field, answers));

  return (
    <section
      aria-label={t('form-preview', 'Preview')}
      className="flex flex-col gap-4 rounded-lg border bg-background p-5"
    >
      <div>
        <h2 className="text-base font-semibold">{form.title ?? form.name}</h2>
        {form.description && <p className="text-sm text-muted-foreground">{form.description}</p>}
      </div>
      {steps > 1 && (
        <div className="text-xs text-muted-foreground">
          <p>{form.steps[step - 1]?.name || t('form-step-n', 'Step {{n}}', { n: step })}</p>
          {form.steps[step - 1]?.description && <p>{form.steps[step - 1]?.description}</p>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        {shown.map((field) => (
          <PreviewField
            key={field.id}
            field={field}
            value={answers[field.id]}
            onChange={(value) => setAnswers((current) => ({ ...current, [field.id]: value }))}
          />
        ))}
      </div>
      <div className="flex justify-between gap-2">
        <Button variant="ghost" disabled={step === 1} onClick={() => setStep(step - 1)}>
          {t('back', 'Back')}
        </Button>
        {step < steps ? (
          <Button variant="secondary" onClick={() => setStep(step + 1)}>
            {t('next', 'Next')}
          </Button>
        ) : (
          <FormButton form={form} label={form.buttonText || t('form-send', 'Send')} />
        )}
      </div>
    </section>
  );
};
