import { IconX } from '@tabler/icons-react';
import { Button, Input, Label } from 'erxes-ui';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { OptionTicket } from './OptionTicket.tsx';
import type { SurveyStep } from './useSurveys.ts';

type Option = SurveyStep['options'][number];

/**
 * Saves a typed field's text when it changed. An empty one goes back to what was saved unless
 * `optional`.
 */
export const saveText =
  (value: string, onSave: (value: string) => void, optional = false) =>
  (field: HTMLInputElement | HTMLTextAreaElement) => {
    const next = field.value.trim();

    if (next === value) return;

    if (next || optional) onSave(next);
    else field.value = value;
  };

/**
 * A text the member types in place, saved when it loses focus or on Enter. Keyed by the saved
 * text, so a save from elsewhere shows here.
 */
export const SavedText = ({
  value,
  optional,
  onSave,
  ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'defaultValue' | 'onBlur' | 'onKeyDown'> & {
  value: string;
  optional?: boolean;
  onSave: (value: string) => void;
}) => {
  const save = saveText(value, onSave, optional);

  return (
    <Input
      key={value}
      {...props}
      defaultValue={value}
      onBlur={(event) => save(event.currentTarget)}
      onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
    />
  );
};

/** One option: its text, its ticket rule and removing it. */
const OptionRow = ({
  option,
  index,
  channelId,
  canRemove,
  onChange,
  onRemove,
}: {
  option: Option;
  index: number;
  channelId: string;
  canRemove: boolean;
  onChange: (option: Option) => void;
  onRemove: () => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <li className="flex items-center gap-1">
      <SavedText
        value={option.text}
        aria-label={t('survey-option-n', 'Option {{n}}', { n: index + 1 })}
        maxLength={100}
        onSave={(text) => onChange({ ...option, text })}
      />
      <OptionTicket
        channelId={channelId}
        option={option}
        onChange={(ticket) => onChange({ ...option, ticket })}
      />
      <Button
        variant="ghost"
        size="icon"
        disabled={!canRemove}
        aria-label={t('survey-remove-option', 'Remove {{option}}', { option: option.text })}
        onClick={onRemove}
      >
        <IconX />
      </Button>
    </li>
  );
};

/** The question's options, each edited in place, then a field that adds one on Enter. */
export const Options = ({
  step,
  channelId,
  onChange,
}: {
  step: SurveyStep;
  channelId: string;
  onChange: (options: Option[]) => void;
}) => {
  const { t } = useTranslation('frontline');
  const { options } = step;

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{t('survey-options', 'Options')}</Label>
      <ul className="flex flex-col gap-1.5">
        {options.map((option, index) => (
          <OptionRow
            key={option.id}
            option={option}
            index={index}
            channelId={channelId}
            canRemove={options.length > 2}
            onChange={(next) => onChange(options.with(index, next))}
            onRemove={() => onChange(options.toSpliced(index, 1))}
          />
        ))}
      </ul>
      {options.length < 10 && (
        <Input
          aria-label={t('survey-add-option', 'Type an option and press Enter')}
          placeholder={t('survey-add-option', 'Type an option and press Enter')}
          maxLength={100}
          onKeyDown={(event) => {
            const text = event.currentTarget.value.trim();

            if (event.key !== 'Enter' || !text) return;

            event.preventDefault();
            onChange([...options, { id: crypto.randomUUID(), text, ticket: null }]);
            event.currentTarget.value = '';
          }}
        />
      )}
    </div>
  );
};
