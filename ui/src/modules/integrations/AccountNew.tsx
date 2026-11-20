import { useMutation } from '@tanstack/react-query';
import {
  Button,
  buttonVariants,
  jsonOf,
  PanelFormLayout,
  type TRecordDraftProps,
  textOf,
} from 'erxes-ui';
import { type ComponentType, type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { useIntegrationChange } from '@/inbox/queries.ts';
import { orpc } from '~/orpc.ts';
import { CallProFields, DiscordFields, PbxFields, TelegramFields } from './ConnectFields.tsx';
import { MailFields } from './MailFields.tsx';
import { queuesOf } from './PbxLines.tsx';
import { KindIcon } from '~/shared/kinds.tsx';
import { META_SETTINGS, useConnectMeta, useMetaApp, useProviderNames } from './useIntegrations.ts';

/** The providers connected with a form here; Facebook and Instagram connect through Meta's login. */
export const FORM_PROVIDERS = ['telegram', 'discord', 'mail', 'call', 'callpro'] as const;

const FormProvider = z.enum(FORM_PROVIDERS);

type FormProvider = z.infer<typeof FormProvider>;

/** Implicit TLS on these ports; on any other the server is asked for STARTTLS. */
const TLS_PORTS = new Set([465, 993]);

const serverOf = (form: FormData, kind: 'imap' | 'smtp') => {
  const port = Number(form.get(`${kind}Port`));

  return {
    host: textOf(form.get(`${kind}Host`)),
    port,
    secure: TLS_PORTS.has(port),
    // Most services sign a mailbox in by its address.
    user: textOf(form.get('user')) || textOf(form.get('address')),
    password: textOf(form.get('password')),
  };
};

/** The channel the form was opened from, which the account joins as it connects. */
interface Into {
  channelId?: string;
}

/** The PBX form's operators, which its list keeps in a hidden input as JSON. */
const Operators = jsonOf(
  z.array(
    z.object({ userId: z.string(), extension: z.string(), sipPassword: z.string().optional() }),
  ),
);

/** Each provider's call with the form's fields. */
const CONNECT = {
  telegram: (form: FormData, into: Into) =>
    orpc.integrations.telegram.connect.call({ token: textOf(form.get('token')), ...into }),
  discord: (form: FormData, into: Into) =>
    orpc.integrations.discord.connect.call({ token: textOf(form.get('token')), ...into }),
  mail: (form: FormData, into: Into) =>
    orpc.integrations.mail.connect.call({
      address: textOf(form.get('address')),
      name: textOf(form.get('name')),
      imap: serverOf(form, 'imap'),
      smtp: serverOf(form, 'smtp'),
      ...into,
    }),
  call: (form: FormData, into: Into) =>
    orpc.integrations.call.connect.call({
      name: textOf(form.get('name')),
      phone: textOf(form.get('phone')),
      srcTrunk: textOf(form.get('srcTrunk')),
      dstTrunk: textOf(form.get('dstTrunk')),
      queues: queuesOf(textOf(form.get('queues'))),
      operators: Operators.parse(textOf(form.get('operators')) || '[]'),
      host: textOf(form.get('host')),
      timeZone: textOf(form.get('timeZone')),
      // The form's channel row picks it, starting from the one it was opened from.
      channelId: textOf(form.get('channelId')) || into.channelId,
    }),
  callpro: (form: FormData, into: Into) =>
    orpc.integrations.callpro.connect.call({ phone: textOf(form.get('phone')), ...into }),
} satisfies Record<FormProvider, (form: FormData, into: Into) => Promise<{ id: string }>>;

const FIELDS: Record<FormProvider, ComponentType<{ channelId?: string }>> = {
  telegram: TelegramFields,
  discord: DiscordFields,
  mail: MailFields,
  call: PbxFields,
  callpro: CallProFields,
};

/** The form for `provider`: its rows, and the provider's refusal under them. */
const ConnectForm = ({
  provider,
  into,
  onCreated,
  onCancel,
}: Omit<TRecordDraftProps, 'defaults'> & { provider: FormProvider; into: Into }) => {
  const { t } = useTranslation('frontline');
  const Fields = FIELDS[provider];
  const { onSuccess } = useIntegrationChange();

  const connect = useMutation({
    mutationFn: (form: FormData) => CONNECT[provider](form, into),
    onSuccess: (account) => {
      onSuccess();
      onCreated(account.id);
    },
  });

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    connect.mutate(new FormData(event.currentTarget));
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <PanelFormLayout
        onCancel={onCancel}
        saving={connect.isPending}
        saveLabel={t('connect', 'Connect')}
      >
        <Fields channelId={into.channelId} />
        {connect.error && (
          <p role="alert" className="text-xs text-destructive-text">
            {connect.error.message}
          </p>
        )}
      </PanelFormLayout>
    </form>
  );
};

/**
 * What to connect, when the draft opened without a provider (core's New, or a reload): Facebook
 * and Instagram through Meta's login, as the Connect menu offers them, then each provider with a
 * form, whose form takes this list's place.
 */
const ProviderPicker = ({ onPick }: { onPick: (provider: FormProvider) => void }) => {
  const { t } = useTranslation('frontline');
  const names = useProviderNames();
  const meta = useConnectMeta();
  const metaApp = useMetaApp();
  const row = buttonVariants({ variant: 'ghost', className: 'w-full justify-start' });

  const metaName = (
    <>
      <KindIcon kind="facebook" />
      {t('facebook-and-instagram', 'Facebook and Instagram')}
    </>
  );

  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="text-sm text-muted-foreground">{t('pick-provider', 'Pick what to connect')}</p>
      <ul aria-label={t('pick-provider', 'Pick what to connect')} className="flex flex-col gap-0.5">
        <li>
          {metaApp === false ? (
            <Link to={META_SETTINGS} className={row}>
              {metaName}
              <span className="text-xs text-muted-foreground">
                {t('meta-app-missing', 'Set up a Meta app in Settings first')}
              </span>
            </Link>
          ) : (
            <Button
              variant="ghost"
              className="w-full justify-start"
              disabled={metaApp === undefined || meta.isPending}
              onClick={() => meta.mutate()}
            >
              {metaName}
            </Button>
          )}
        </li>
        {FORM_PROVIDERS.map((provider) => (
          <li key={provider}>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => onPick(provider)}
            >
              <KindIcon kind={provider} />
              {names[provider]}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
};

/**
 * A new connected account in core's side panel: a Telegram or Discord bot by its token, a mailbox
 * by its IMAP and SMTP login, a Grandstream PBX by its API user, or a CallPro line by its number.
 * The Connect menu names the provider; a draft without one asks for it first. The provider checks
 * the account before it saves. Opened from a channel, the account joins it.
 */
export const AccountNew = ({ defaults, ...props }: TRecordDraftProps) => {
  const named = FormProvider.safeParse(defaults.provider);
  const [picked, setPicked] = useState<FormProvider | null>(null);
  const provider = named.success ? named.data : picked;
  const channelId = textOf(defaults.channelId) || undefined;

  if (!provider) return <ProviderPicker onPick={setPicked} />;

  return <ConnectForm provider={provider} into={{ channelId }} {...props} />;
};
