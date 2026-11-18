import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Button, Form, Input, Select } from 'erxes-ui';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { LanguageSelect } from '@/knowledgebase/LanguageSelect.tsx';
import { orpc } from '~/orpc.ts';
import { SettingsCard } from '~/shared/Settings.tsx';
import { SwitchRow } from './fields.tsx';
import type { MessengerForm } from './queries.ts';

const NO_TOPIC = 'none';

const LanguageRow = () => {
  const { t } = useTranslation('frontline');
  const { control } = useFormContext<MessengerForm>();

  return (
    <Form.Field
      control={control}
      name="language"
      render={({ field }) => (
        <Form.Item>
          <Form.Label>{t('language', 'Language')}</Form.Label>
          <Form.Control>
            <LanguageSelect value={field.value} onChange={(code) => field.onChange(code ?? 'en')} />
          </Form.Control>
        </Form.Item>
      )}
    />
  );
};

/** The knowledge base topic visitors search in the messenger, among the ones the member reads. */
const TopicRow = () => {
  const { t } = useTranslation('frontline');
  const { control } = useFormContext<MessengerForm>();
  const topics = useQuery(orpc.knowledgebase.topics.list.queryOptions({ input: {} }));

  return (
    <Form.Field
      control={control}
      name="knowledgeBaseTopicId"
      render={({ field }) => (
        <Form.Item>
          <Form.Label>{t('messenger-kb-topic', 'Knowledge base')}</Form.Label>
          <Select
            value={field.value ?? NO_TOPIC}
            onValueChange={(id) => field.onChange(id === NO_TOPIC ? null : id)}
          >
            <Form.Control>
              <Select.Trigger aria-label={t('messenger-kb-topic', 'Knowledge base')}>
                <Select.Value>
                  {topics.data?.topics.find((topic) => topic.id === field.value)?.title ??
                    t('messenger-no-kb', 'None')}
                </Select.Value>
              </Select.Trigger>
            </Form.Control>
            <Select.Content>
              <Select.Item value={NO_TOPIC}>{t('messenger-no-kb', 'None')}</Select.Item>
              {(topics.data?.topics ?? []).map((topic) => (
                <Select.Item key={topic.id} value={topic.id}>
                  {topic.title}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </Form.Item>
      )}
    />
  );
};

/** Pages of the website the messenger links to, each a button with a line under it. */
const WebsiteApps = () => {
  const { t } = useTranslation('frontline');
  const { control, register } = useFormContext<MessengerForm>();
  const { fields, append, remove } = useFieldArray({ control, name: 'websiteApps' });

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <span className="text-sm font-medium">{t('messenger-website-apps', 'Website pages')}</span>
      {fields.map((row, index) => (
        <div key={row.id} className="flex items-center gap-2">
          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
            <Input
              aria-label={t('messenger-app-button', 'Button text')}
              placeholder={t('messenger-app-button', 'Button text')}
              {...register(`websiteApps.${index}.buttonText`)}
            />
            <Input
              aria-label={t('messenger-app-url', 'Page address')}
              placeholder="https://"
              {...register(`websiteApps.${index}.url`)}
            />
            <Input
              aria-label={t('messenger-app-description', 'Description')}
              placeholder={t('messenger-app-description', 'Description')}
              {...register(`websiteApps.${index}.description`)}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('messenger-remove-app', 'Remove this page')}
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
        onClick={() => append({ url: '', buttonText: '', description: '' })}
      >
        <IconPlus />
        {t('messenger-add-app', 'Add page')}
      </Button>
    </div>
  );
};

/** Who may write and what the messenger offers besides the chat. */
export const BehaviourCard = () => {
  const { t } = useTranslation('frontline');

  return (
    <SettingsCard
      title={t('messenger-behaviour', 'Behaviour')}
      description={t(
        'messenger-behaviour-description',
        'Who may write, what the launcher shows, and the pages and articles it links to.',
      )}
    >
      <LanguageRow />
      <TopicRow />
      <SwitchRow
        name="requireAuth"
        label={t('messenger-require-auth', 'Ask for an email or phone')}
        hint={t('messenger-require-auth-hint', 'Visitors leave one before they write.')}
      />
      <SwitchRow
        name="showChat"
        label={t('messenger-show-chat', 'Show the chat')}
        hint={t('messenger-show-chat-hint', 'Visitors can start a conversation.')}
      />
      <SwitchRow
        name="showLauncher"
        label={t('messenger-show-launcher', 'Show the launcher')}
        hint={t('messenger-show-launcher-hint', 'The round button that opens the messenger.')}
      />
      <SwitchRow
        name="forceLogoutWhenResolve"
        label={t('messenger-logout-resolved', 'Sign out when resolved')}
        hint={t('messenger-logout-resolved-hint', 'A resolved conversation ends the visit.')}
      />
      <WebsiteApps />
    </SettingsCard>
  );
};
