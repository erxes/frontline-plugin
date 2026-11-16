import { IconBrandFacebook, IconHandClick, IconLetterCase, IconMessage } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Input, PanelFormLayout, PanelFormRow, Select, type TRecordDraftProps } from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { textOf } from '~/shared/hooks.ts';
import { useBots, useIntegrationChange, useMetaAccounts } from './useMeta.ts';

/** The pages and accounts without a bot: a page has one. */
const AccountSelect = ({ value, onChange }: { value: string; onChange: (id: string) => void }) => {
  const { t } = useTranslation('frontline');
  const accounts = useMetaAccounts();
  const bots = useBots();

  const free = (accounts.data ?? []).filter(
    (account) => !bots.data?.some((bot) => bot.accountId === account.id),
  );

  const nameOf = (id: string) => accounts.data?.find((account) => account.id === id)?.name ?? '';

  return (
    <Select value={value} onValueChange={(next) => next && onChange(next)}>
      <Select.Trigger variant="bordered" aria-label={t('page', 'Page')}>
        <Select.Value placeholder={t('pick-page', 'Pick a page')}>
          {(id: string) => nameOf(id)}
        </Select.Value>
      </Select.Trigger>
      <Select.Content>
        {free.map((account) => (
          <Select.Item key={account.id} value={account.id}>
            {account.name}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
};

/**
 * A new bot in core's side panel: the page or Instagram account it runs on, its name, and on
 * Messenger the Get Started label and greeting. Its menu and ice breakers are added on the bot.
 */
export const BotNew = ({ defaults, onCreated, onCancel }: TRecordDraftProps) => {
  const { t } = useTranslation('frontline');
  const [accountId, setAccountId] = useState(() => textOf(defaults.accountId));
  const { onSuccess } = useIntegrationChange();

  const create = useMutation(
    orpc.integrations.meta.bots.create.mutationOptions({
      onSuccess: async (bot) => {
        await onSuccess();
        onCreated(bot.id);
      },
    }),
  );

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    create.mutate({
      accountId,
      name: textOf(form.get('name')),
      getStartedText: textOf(form.get('getStartedText')) || null,
      greeting: textOf(form.get('greeting')) || null,
      persistentMenu: [],
      iceBreakers: [],
    });
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <PanelFormLayout
        onCancel={onCancel}
        saving={create.isPending}
        saveLabel={t('create-bot', 'Create bot')}
      >
        <PanelFormRow label={t('page', 'Page')} icon={IconBrandFacebook} required>
          <AccountSelect value={accountId} onChange={setAccountId} />
        </PanelFormRow>
        <PanelFormRow label={t('name', 'Name')} icon={IconLetterCase} required>
          <Input name="name" required aria-label={t('name', 'Name')} variant="bordered" text="sm" />
        </PanelFormRow>
        <PanelFormRow label={t('get-started-label', 'Get Started label')} icon={IconHandClick}>
          <Input
            name="getStartedText"
            maxLength={30}
            aria-label={t('get-started-label', 'Get Started label')}
            placeholder={t('get-started', 'Get started')}
            variant="bordered"
            text="sm"
          />
        </PanelFormRow>
        <PanelFormRow label={t('greeting', 'Greeting')} icon={IconMessage}>
          <Input
            name="greeting"
            maxLength={160}
            aria-label={t('greeting', 'Greeting')}
            variant="bordered"
            text="sm"
          />
        </PanelFormRow>
        {create.error && (
          <p role="alert" className="text-xs text-destructive-text">
            {create.error.message}
          </p>
        )}
      </PanelFormLayout>
    </form>
  );
};
