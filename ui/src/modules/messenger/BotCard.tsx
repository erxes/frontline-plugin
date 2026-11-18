import { IconPlus, IconTrash } from '@tabler/icons-react';
import { Button, Input } from 'erxes-ui';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { SettingsCard } from '~/shared/Settings.tsx';
import { TextRow } from './fields.tsx';
import type { MessengerForm } from './queries.ts';

/** The bot's menu: buttons that send their text, or open a link when they have one. */
const MenuRows = () => {
  const { t } = useTranslation('frontline');
  const { control, register } = useFormContext<MessengerForm>();
  const { fields, append, remove } = useFieldArray({ control, name: 'botMenu' });

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <span className="text-sm font-medium">{t('messenger-bot-menu', 'Menu')}</span>
      {fields.map((row, index) => (
        <div key={row.id} className="flex items-center gap-2">
          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              aria-label={t('messenger-menu-text', 'Button text')}
              placeholder={t('messenger-menu-text', 'Button text')}
              {...register(`botMenu.${index}.text`)}
            />
            <Input
              aria-label={t('messenger-menu-link', 'Link')}
              placeholder={t('messenger-menu-link-placeholder', 'https:// (optional)')}
              {...register(`botMenu.${index}.link`, {
                setValueAs: (link: string) => link || null,
              })}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('messenger-remove-menu', 'Remove this button')}
            onClick={() => remove(index)}
          >
            <IconTrash />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="w-min"
        onClick={() => append({ text: '', link: null })}
      >
        <IconPlus />
        {t('messenger-add-menu', 'Add button')}
      </Button>
    </div>
  );
};

/** What the bot says first and offers; automations on new messages give its other answers. */
export const BotCard = () => {
  const { t } = useTranslation('frontline');

  return (
    <SettingsCard
      title={t('messenger-bot', 'Bot')}
      description={t(
        'messenger-bot-description',
        'The first answer a new conversation gets. Automations on new messages answer the rest until a person takes over.',
      )}
    >
      <TextRow name="botGreeting" label={t('messenger-bot-greeting', 'Bot greeting')} long />
      <MenuRows />
    </SettingsCard>
  );
};
