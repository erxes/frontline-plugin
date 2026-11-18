import { useMutation } from '@tanstack/react-query';
import { PanelFormLayout, type TRecordDraftProps, textOf } from 'erxes-ui';
import type { ComponentType, SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useIntegrationChange } from '@/inbox/queries.ts';
import { orpc } from '~/orpc.ts';
import { CallProFields, DiscordFields, PbxFields, TelegramFields } from './ConnectFields.tsx';
import { MailFields } from './MailFields.tsx';

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

/** Each provider's call with the form's fields. */
const CONNECT = {
  telegram: (form: FormData) =>
    orpc.integrations.telegram.connect.call({ token: textOf(form.get('token')) }),
  discord: (form: FormData) =>
    orpc.integrations.discord.connect.call({ token: textOf(form.get('token')) }),
  mail: (form: FormData) =>
    orpc.integrations.mail.connect.call({
      address: textOf(form.get('address')),
      name: textOf(form.get('name')),
      imap: serverOf(form, 'imap'),
      smtp: serverOf(form, 'smtp'),
    }),
  call: (form: FormData) =>
    orpc.integrations.call.connect.call({
      phone: textOf(form.get('phone')),
      host: textOf(form.get('host')),
      apiUser: textOf(form.get('apiUser')),
      apiPassword: textOf(form.get('apiPassword')),
      timeZone: textOf(form.get('timeZone')),
      srcTrunk: textOf(form.get('srcTrunk')),
      dstTrunk: textOf(form.get('dstTrunk')),
      turnUrl: textOf(form.get('turnUrl')),
      turnUsername: textOf(form.get('turnUsername')),
      turnPassword: textOf(form.get('turnPassword')),
    }),
  callpro: (form: FormData) =>
    orpc.integrations.callpro.connect.call({ phone: textOf(form.get('phone')) }),
} satisfies Record<FormProvider, (form: FormData) => Promise<{ id: string }>>;

const FIELDS: Record<FormProvider, ComponentType> = {
  telegram: TelegramFields,
  discord: DiscordFields,
  mail: MailFields,
  call: PbxFields,
  callpro: CallProFields,
};

/** The form for `provider`: its rows, and the provider's refusal under them. */
const ConnectForm = ({
  provider,
  onCreated,
  onCancel,
}: Omit<TRecordDraftProps, 'defaults'> & { provider: FormProvider }) => {
  const { t } = useTranslation('frontline');
  const Fields = FIELDS[provider];
  const { onSuccess } = useIntegrationChange();

  const connect = useMutation({
    mutationFn: CONNECT[provider],
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
        <Fields />
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
 * A new connected account in core's side panel, for the provider the integrations page picked:
 * a Telegram or Discord bot by its token, a mailbox by its IMAP and SMTP login, a Grandstream PBX
 * by its API user, or a CallPro line by its number. The provider checks it before it saves.
 */
export const AccountNew = ({ defaults, ...props }: TRecordDraftProps) => {
  const { t } = useTranslation('frontline');
  const provider = FormProvider.safeParse(defaults.provider);

  if (!provider.success)
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {t('pick-provider', 'Pick what to connect on the integrations page')}
      </p>
    );

  return <ConnectForm provider={provider.data} {...props} />;
};
