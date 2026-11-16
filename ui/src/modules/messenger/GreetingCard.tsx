import { memberQueries } from '@erxes/core-contract/client';
import { Form, LookupPicker, StringArrayInput, useMemberOptions } from 'erxes-ui';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { SettingsCard, TextRow } from './fields.tsx';
import type { MessengerForm } from './queries.ts';

/** The members the messenger shows as its team, at most ten. */
const TeamRow = () => {
  const { t } = useTranslation('frontline');
  const { control } = useFormContext<MessengerForm>();
  const picked = useWatch({ control, name: 'supporterIds' });
  const lookup = useMemberOptions(memberQueries, true, picked);

  return (
    <Form.Field
      control={control}
      name="supporterIds"
      render={({ field }) => (
        <Form.Item>
          <Form.Label>{t('messenger-team', 'Team members')}</Form.Label>
          <LookupPicker
            multiple
            lookup={lookup}
            value={field.value}
            onValueChange={(ids) => field.onChange(ids.slice(0, 10))}
            placeholder={t('messenger-pick-team', 'Pick members')}
          />
          <Form.Message />
        </Form.Item>
      )}
    />
  );
};

const LinksRow = () => {
  const { t } = useTranslation('frontline');
  const { control } = useFormContext<MessengerForm>();

  return (
    <Form.Field
      control={control}
      name="links"
      render={({ field }) => (
        <Form.Item>
          <Form.Label>{t('messenger-links', 'Links')}</Form.Label>
          <StringArrayInput
            value={field.value}
            onValueChange={field.onChange}
            placeholder={t('messenger-link-placeholder', 'https://facebook.com/yourpage')}
          />
          <Form.Message />
        </Form.Item>
      )}
    />
  );
};

/** What visitors read: the greeting, the team and links under it, and the three messages. */
export const GreetingCard = () => {
  const { t } = useTranslation('frontline');

  return (
    <SettingsCard
      title={t('messenger-greeting', 'Greeting and messages')}
      description={t(
        'messenger-greeting-description',
        'What visitors read when they open the messenger, while you are away, and once you are done.',
      )}
    >
      <TextRow name="greetingTitle" label={t('messenger-greeting-title', 'Greeting title')} />
      <TeamRow />
      <TextRow
        name="greetingMessage"
        label={t('messenger-greeting-message', 'Greeting message')}
        long
      />
      <TextRow name="welcome" label={t('welcome-message', 'Welcome message')} long />
      <TextRow name="away" label={t('messenger-away', 'Away message')} long />
      <TextRow name="thank" label={t('messenger-thank', 'Thank-you message')} long />
      <LinksRow />
    </SettingsCard>
  );
};
