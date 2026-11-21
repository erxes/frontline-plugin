import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react';
import { Button, Input, Textarea } from 'erxes-ui';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { SettingsCard } from '~/shared/Settings.tsx';
import type { MessengerForm } from './queries.ts';

/** As many common questions as the API keeps. */
const MAX_QUESTIONS = 10;

/**
 * The common questions the home screen offers, in order, each with the answer a visitor gets at
 * once for tapping or typing it.
 */
export const FaqCard = () => {
  const { t } = useTranslation('frontline');
  const { control, register } = useFormContext<MessengerForm>();
  const { fields, append, remove, move } = useFieldArray({ control, name: 'faq' });

  return (
    <SettingsCard
      title={t('messenger-faq', 'FAQ')}
      description={t(
        'messenger-faq-description',
        'Questions the home screen offers. A visitor who taps one, or types it, gets its answer at once, without the agent or the team.',
      )}
    >
      <div className="flex flex-col gap-4 sm:col-span-2">
        {fields.map((row, index) => (
          <div key={row.id} className="flex items-start gap-2">
            <div className="flex flex-1 flex-col gap-2">
              <Input
                aria-label={t('messenger-faq-question', 'Question')}
                placeholder={t('messenger-faq-question', 'Question')}
                maxLength={150}
                {...register(`faq.${index}.question`)}
              />
              <Textarea
                aria-label={t('messenger-faq-answer', 'Answer')}
                placeholder={t('messenger-faq-answer', 'Answer')}
                maxLength={2000}
                {...register(`faq.${index}.answer`)}
              />
            </div>
            <div className="flex flex-col">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('messenger-faq-up', 'Move up')}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                <IconArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('messenger-faq-down', 'Move down')}
                disabled={index === fields.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <IconArrowDown />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('messenger-faq-remove', 'Remove this question')}
                onClick={() => remove(index)}
              >
                <IconTrash />
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="w-min"
          disabled={fields.length >= MAX_QUESTIONS}
          onClick={() => append({ id: crypto.randomUUID(), question: '', answer: '' })}
        >
          <IconPlus />
          {t('messenger-faq-add', 'Add question')}
        </Button>
      </div>
    </SettingsCard>
  );
};
