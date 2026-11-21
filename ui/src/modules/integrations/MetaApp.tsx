import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Form, Input, Skeleton, toast, useConfirm } from 'erxes-ui';
import { useForm, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { InferClientInputs, InferClientOutputs } from '@orpc/client';
import type { Client } from '@frontline/api';
import { orpc } from '~/orpc.ts';
import { InstallCode } from '~/shared/InstallCode.tsx';
import { ListError } from '~/shared/List.tsx';
import { SaveBar } from '~/shared/Settings.tsx';

type Settings = InferClientOutputs<Client>['integrations']['meta']['app']['get'];

/** The form's fields: an empty secret keeps the saved one. */
type Values = Required<InferClientInputs<Client>['integrations']['meta']['app']['save']>;

const valuesOf = (settings: Settings): Values => ({
  appId: settings.appId ?? '',
  appSecret: '',
  verifyToken: settings.verifyToken ?? '',
});

/** The saved settings, kept in the query once a change answers with them, and `done` said. */
const useMetaAppChange = (done: string) => {
  const client = useQueryClient();

  return {
    onSuccess: (saved: Settings) => {
      client.setQueryData(orpc.integrations.meta.app.get.queryKey(), saved);
      toast({ title: done });
    },
    onError: (error: Error) => toast({ title: error.message, variant: 'destructive' }),
  };
};

/** Where the organisation's app stands: its own, the install's, or none yet. */
const AppStatus = ({ settings }: { settings: Settings }) => {
  const { t } = useTranslation('frontline');
  const { confirm } = useConfirm();

  const remove = useMutation(
    orpc.integrations.meta.app.remove.mutationOptions(
      useMetaAppChange(t('meta-app-removed', 'Meta app removed')),
    ),
  );

  if (settings.own)
    return (
      <div className="flex items-center justify-between gap-4 text-sm">
        <p>
          {t('meta-app-own', 'Pages and Instagram accounts connect through your own Meta app.')}
        </p>
        {settings.installApp && (
          <Button
            variant="outline"
            disabled={remove.isPending}
            onClick={() =>
              void confirm({
                message: t(
                  'meta-app-remove-confirm',
                  "Use this install's Meta app instead? Pages connected through yours stop receiving messages until they connect again.",
                ),
              }).then(() => remove.mutate({}))
            }
          >
            {t('meta-app-use-install', "Use the install's app")}
          </Button>
        )}
      </div>
    );

  return (
    <p className="text-sm text-muted-foreground">
      {settings.installApp
        ? t(
            'meta-app-install',
            "Pages connect through this install's Meta app. Set your own to use your app's name and review.",
          )
        : t(
            'meta-app-none',
            'Set a Meta app before you connect Facebook pages and Instagram accounts.',
          )}
    </p>
  );
};

/** The app's id, secret (sealed once saved, so it shows empty) and verify token. */
const AppFields = ({ own }: { own: boolean }) => {
  const { t } = useTranslation('frontline');
  const { control } = useFormContext<Values>();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Form.Field
        control={control}
        name="appId"
        rules={{
          required: t('meta-app-id-required', 'Enter the app id'),
          pattern: {
            value: /^\d{5,20}$/,
            message: t('meta-app-id-digits', 'A Meta app id is digits'),
          },
        }}
        render={({ field }) => (
          <Form.Item>
            <Form.Label>{t('meta-app-id', 'App ID')}</Form.Label>
            <Form.Control>
              <Input {...field} inputMode="numeric" autoComplete="off" />
            </Form.Control>
            <Form.Message />
          </Form.Item>
        )}
      />
      <Form.Field
        control={control}
        name="appSecret"
        rules={{ required: own ? false : t('meta-app-secret-required', 'Enter the app secret') }}
        render={({ field }) => (
          <Form.Item>
            <Form.Label>{t('meta-app-secret', 'App secret')}</Form.Label>
            <Form.Control>
              <Input
                {...field}
                type="password"
                autoComplete="new-password"
                placeholder={own ? t('meta-app-secret-saved', 'Saved; type to replace') : ''}
              />
            </Form.Control>
            <Form.Message />
          </Form.Item>
        )}
      />
      <Form.Field
        control={control}
        name="verifyToken"
        rules={{
          required: t('meta-verify-token-required', 'Enter a verify token'),
          minLength: {
            value: 8,
            message: t('meta-verify-token-short', 'Use at least 8 characters'),
          },
        }}
        render={({ field }) => (
          <Form.Item>
            <Form.Label>{t('meta-verify-token', 'Verify token')}</Form.Label>
            <Form.Control>
              <Input {...field} autoComplete="off" />
            </Form.Control>
            <Form.Message />
          </Form.Item>
        )}
      />
    </div>
  );
};

/** The two addresses the app lists in Meta for Developers: its webhook and its login's return. */
const AddressCards = ({ settings }: { settings: Settings }) => {
  const { t } = useTranslation('frontline');

  return (
    <>
      <Card>
        <Card.Header>
          <Card.Title>{t('meta-webhook', 'Webhook')}</Card.Title>
          <Card.Description>
            {t(
              'meta-webhook-description',
              'In your app’s Webhooks settings, subscribe Page and Instagram to this callback URL with the verify token above.',
            )}
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <InstallCode code={settings.webhookUrl} label={t('meta-callback-url', 'Callback URL')} />
        </Card.Content>
      </Card>
      <Card>
        <Card.Header>
          <Card.Title>{t('meta-login', 'Facebook Login')}</Card.Title>
          <Card.Description>
            {t(
              'meta-login-description',
              'In your app’s Facebook Login settings, add this address to Valid OAuth Redirect URIs, or Connect stops at Meta.',
            )}
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <InstallCode
            code={settings.callbackUrl}
            label={t('meta-redirect-uri', 'Valid OAuth Redirect URI')}
          />
        </Card.Content>
      </Card>
    </>
  );
};

const MetaAppForm = ({ settings }: { settings: Settings }) => {
  const { t } = useTranslation('frontline');
  const { confirm } = useConfirm();
  const change = useMetaAppChange(t('meta-app-saved', 'Meta app saved'));
  const form = useForm({ defaultValues: valuesOf(settings) });

  const save = useMutation(
    orpc.integrations.meta.app.save.mutationOptions({
      ...change,
      onSuccess: (saved) => {
        form.reset(valuesOf(saved));
        change.onSuccess(saved);
      },
    }),
  );

  const submit = form.handleSubmit((values) => {
    const send = () =>
      save.mutate({
        appId: values.appId,
        appSecret: values.appSecret || undefined,
        verifyToken: values.verifyToken,
      });

    // Pages connected through the saved app sign with its secret, which the new one replaces.
    if (settings.own && values.appId !== settings.appId)
      void confirm({
        message: t(
          'meta-app-switch-confirm',
          'Switch to another Meta app? Pages connected through the current one stop receiving messages until they connect again.',
        ),
      }).then(send);
    else send();
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <Card>
          <Card.Header>
            <Card.Title>{t('meta-app', 'Meta app')}</Card.Title>
            <Card.Description>
              {t(
                'meta-app-description',
                'The app in Meta for Developers that your Facebook pages and Instagram accounts connect through.',
              )}
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <div className="flex flex-col gap-4">
              <AppStatus settings={settings} />
              <AppFields own={settings.own} />
            </div>
          </Card.Content>
        </Card>
        <AddressCards settings={settings} />
        <SaveBar
          dirty={form.formState.isDirty}
          saving={save.isPending}
          onDiscard={() => form.reset()}
        />
      </form>
    </Form>
  );
};

/** Settings › Integrations › Meta: the organisation's own Meta app and its webhook. */
export const MetaApp = () => {
  const settings = useQuery(orpc.integrations.meta.app.get.queryOptions());

  if (settings.error) return <ListError error={settings.error} />;

  if (!settings.data) return <Skeleton className="h-64 w-full" />;

  // A new app, or none, starts a new form, so a removed app's values don't linger.
  return <MetaAppForm key={settings.data.appId ?? ''} settings={settings.data} />;
};
