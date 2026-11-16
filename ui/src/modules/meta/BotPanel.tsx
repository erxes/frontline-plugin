import {
  IconBrandFacebook,
  IconDots,
  IconHandClick,
  IconHeartbeat,
  IconLetterCase,
  IconLink,
  IconMenu2,
  IconMessage,
  IconMessageQuestion,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Input,
  PanelField,
  PanelSection,
  Skeleton,
  Spinner,
  TextField,
  type TRecordSlotProps,
} from 'erxes-ui';
import { type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { InfoRow } from '~/shared/Panel.tsx';
import { orpc } from '~/orpc.ts';
import { textOf } from '~/shared/hooks.ts';
import { ActionsMenu } from '~/shared/Records.tsx';
import { type Bot, useBot, useIntegrationChange, useRemoveBot, useUpdateBot } from './useMeta.ts';

/** The panel header's title: the bot's name. */
export const BotTitle = ({ contentId }: TRecordSlotProps) => {
  const bot = useBot(contentId);

  if (bot.isPending) return <Skeleton className="h-4 w-32" />;

  return <span className="truncate">{bot.data?.name ?? bot.error?.message}</span>;
};

/** The header's menu: save the profile at Meta again, or remove the bot. */
export const BotActions = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const bot = useBot(contentId);

  const sync = useMutation(
    orpc.integrations.meta.bots.sync.mutationOptions(useIntegrationChange()),
  );

  const remove = useRemoveBot();

  if (!bot.data) return null;

  const { data } = bot;

  return (
    <ActionsMenu
      trigger={
        <Button variant="ghost" size="icon" aria-label={t('bot-menu', 'Bot actions')}>
          <IconDots />
        </Button>
      }
      actions={[
        {
          value: 'sync',
          icon: <IconRefresh />,
          label: t('sync-again', 'Save at Meta again'),
          onSelect: () => sync.mutate({ id: data.id }),
        },
        {
          value: 'remove',
          icon: <IconTrash />,
          label: t('remove', 'Remove'),
          onSelect: () => void remove(data),
        },
      ]}
    />
  );
};

/** One row of a list the bot shows: its text, and a button that takes it out. */
const ItemRow = ({
  label,
  hint,
  onRemove,
}: {
  label: string;
  hint?: string;
  onRemove: () => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <li className="flex items-center gap-2 px-2 py-1 text-xs">
      <span className="flex-1 truncate">
        {label}
        {hint && <span className="ml-2 text-muted-foreground">{hint}</span>}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('remove-item', 'Remove {{name}}', { name: label })}
        onClick={onRemove}
      >
        <IconX />
      </Button>
    </li>
  );
};

/** A row's inputs and its Add button, cleared once the item is added. */
const AddRow = ({
  fields,
  onAdd,
}: {
  fields: { name: string; label: string; maxLength?: number; required?: boolean; type?: string }[];
  onAdd: (values: Record<string, string>) => void;
}) => {
  const { t } = useTranslation('frontline');

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    onAdd(Object.fromEntries(fields.map(({ name }) => [name, textOf(form.get(name)).trim()])));
    event.currentTarget.reset();
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2 px-2 py-1">
      {fields.map((field) => (
        <Input
          key={field.name}
          name={field.name}
          type={field.type}
          required={field.required}
          maxLength={field.maxLength}
          aria-label={field.label}
          placeholder={field.label}
          variant="bordered"
          text="sm"
        />
      ))}
      <Button type="submit" variant="secondary">
        <IconPlus />
        {t('add', 'Add')}
      </Button>
    </form>
  );
};

/**
 * The persistent menu: buttons that come back to the inbox as the customer's message, and
 * links. Messenger shows Get Started first.
 */
const MenuSection = ({ bot }: { bot: Bot }) => {
  const { t } = useTranslation('frontline');
  const { save } = useUpdateBot(bot);

  return (
    <PanelSection title={t('persistent-menu', 'Persistent menu')} icon={IconMenu2}>
      <ul aria-label={t('persistent-menu', 'Persistent menu')}>
        {bot.persistentMenu.map((item) => (
          <ItemRow
            key={item.id}
            label={item.title}
            hint={item.type === 'link' ? item.url : undefined}
            onRemove={() =>
              save({ persistentMenu: bot.persistentMenu.filter((each) => each.id !== item.id) })
            }
          />
        ))}
      </ul>
      <AddRow
        fields={[
          {
            name: 'title',
            label: t('menu-item-title', 'Button text'),
            maxLength: 30,
            required: true,
          },
          { name: 'url', label: t('menu-item-link', 'Link (optional)'), type: 'url' },
        ]}
        onAdd={({ title = '', url }) =>
          save({
            persistentMenu: [
              ...bot.persistentMenu,
              url
                ? { id: crypto.randomUUID(), type: 'link', title, url }
                : { id: crypto.randomUUID(), type: 'postback', title },
            ],
          })
        }
      />
    </PanelSection>
  );
};

/** Up to four questions offered before a customer's first message. */
const IceBreakersSection = ({ bot }: { bot: Bot }) => {
  const { t } = useTranslation('frontline');
  const { save } = useUpdateBot(bot);

  return (
    <PanelSection title={t('ice-breakers', 'Ice breakers')} icon={IconMessageQuestion}>
      <ul aria-label={t('ice-breakers', 'Ice breakers')}>
        {bot.iceBreakers.map((item) => (
          <ItemRow
            key={item.id}
            label={item.question}
            onRemove={() =>
              save({ iceBreakers: bot.iceBreakers.filter((each) => each.id !== item.id) })
            }
          />
        ))}
      </ul>
      {bot.iceBreakers.length < 4 && (
        <AddRow
          fields={[
            { name: 'question', label: t('question', 'Question'), maxLength: 80, required: true },
          ]}
          onAdd={({ question = '' }) =>
            save({ iceBreakers: [...bot.iceBreakers, { id: crypto.randomUUID(), question }] })
          }
        />
      )}
    </PanelSection>
  );
};

/** The bot's own fields, edited in place and saved at Meta as they change. */
const BotFields = ({ bot }: { bot: Bot }) => {
  const { t } = useTranslation('frontline');
  const { save } = useUpdateBot(bot);
  const scope = `frontline-meta-bot.${bot.id}`;
  const messenger = bot.provider === 'facebook';

  return (
    <PanelSection title={t('bot', 'Bot')}>
      <PanelField icon={IconLetterCase} label={t('name', 'Name')}>
        <TextField
          scope={`${scope}.name`}
          value={bot.name}
          placeholder={t('name', 'Name')}
          onSave={(name) => {
            const next = name.trim();

            if (next && next !== bot.name) save({ name: next });
          }}
        />
      </PanelField>
      <InfoRow icon={IconBrandFacebook} label={t('page', 'Page')}>
        {bot.accountName}
      </InfoRow>
      <PanelField icon={IconHeartbeat} label={t('status', 'Status')} cell={false}>
        <span className="flex items-center gap-2 px-2 text-xs">
          <Badge variant={bot.status === 'healthy' ? 'success' : 'destructive'}>
            {bot.status === 'healthy' ? t('working', 'Working') : t('broken', 'Broken')}
          </Badge>
          {bot.error}
        </span>
      </PanelField>
      {messenger && (
        <>
          <PanelField icon={IconHandClick} label={t('get-started-label', 'Get Started label')}>
            <TextField
              scope={`${scope}.getStartedText`}
              value={bot.getStartedText ?? ''}
              placeholder={t('get-started', 'Get started')}
              onSave={(text) => save({ getStartedText: text.trim() || null })}
            />
          </PanelField>
          <PanelField icon={IconMessage} label={t('greeting', 'Greeting')}>
            <TextField
              scope={`${scope}.greeting`}
              value={bot.greeting ?? ''}
              placeholder={t('greeting', 'Greeting')}
              onSave={(text) => save({ greeting: text.trim() || null })}
            />
          </PanelField>
        </>
      )}
      <PanelField icon={IconLink} label={t('menu-taps', 'Taps')} cell={false}>
        <span className="px-2 text-xs text-muted-foreground">
          {t('menu-taps-hint', 'A tapped button reaches the inbox as the customer’s message')}
        </span>
      </PanelField>
    </PanelSection>
  );
};

/** The Detail tab: the bot's fields, its persistent menu and its ice breakers. */
export const BotDetail = ({ contentId }: TRecordSlotProps) => {
  const bot = useBot(contentId);

  if (bot.isPending) return <Spinner area="lg" />;

  if (bot.isError) {
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {bot.error.message}
      </p>
    );
  }

  return (
    <div key={bot.data.id}>
      <BotFields bot={bot.data} />
      <MenuSection bot={bot.data} />
      <IceBreakersSection bot={bot.data} />
    </div>
  );
};
