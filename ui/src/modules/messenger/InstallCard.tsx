import { useIntegrationChange } from '@/inbox/queries.ts';
import { useMutation } from '@tanstack/react-query';
import { Button, Label, useConfirm } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { InstallCode, scriptTag } from '~/shared/InstallCode.tsx';
import { SettingsCard } from '~/shared/Settings.tsx';
import type { MessengerSettings } from './queries.ts';

/** What a website sets before the script to sign its visitor in. */
const SIGNED_VISITOR = `<script>
  window.frontlineMessenger = {
    email: 'ann@example.com',
    // On your server: HMAC-SHA256 of the email in hex, keyed with the identity secret.
    hash: '<hash>',
  };
</script>`;

/**
 * The identity secret a website signs its visitors with, and a new one on request. A visitor
 * becomes an existing customer only with that signature.
 */
const IdentitySecret = ({ id, secret }: { id: string; secret: string | null }) => {
  const { t } = useTranslation('frontline');
  const { confirm } = useConfirm();

  const rotate = useMutation(
    orpc.integrations.messenger.rotateSecret.mutationOptions(useIntegrationChange()),
  );

  const replace = () =>
    void confirm({
      message: t('messenger-secret-rotate-confirm', 'Make a new identity secret?'),
      options: {
        okLabel: t('messenger-secret-rotate', 'Rotate secret'),
        description: t(
          'messenger-secret-rotate-description',
          'Signatures made with the current secret stop working until your website uses the new one.',
        ),
      },
    }).then(() => rotate.mutate({ id }));

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <Label>{t('messenger-secret', 'Identity secret')}</Label>
      <p className="text-sm text-muted-foreground">
        {t(
          'messenger-secret-description',
          'To sign visitors in, set window.frontlineMessenger before the script with their email, phone or userId and its hash. Without a hash, an email or phone only fills in the visitor’s own contact and never opens an existing customer’s conversations.',
        )}
      </p>
      {secret && (
        <InstallCode
          code={secret}
          label={t('messenger-secret-code', 'Messenger identity secret')}
        />
      )}
      <InstallCode
        code={SIGNED_VISITOR}
        label={t('messenger-signed-code', 'Signed visitor example')}
      />
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={rotate.isPending}
        onClick={secret ? replace : () => rotate.mutate({ id })}
      >
        {secret
          ? t('messenger-secret-rotate', 'Rotate secret')
          : t('messenger-secret-make', 'Make a secret')}
      </Button>
    </div>
  );
};

/**
 * The line a website adds to show the messenger, copied with a click, and for a member who may
 * change the messenger, the secret that signs visitors in.
 */
export const InstallCard = ({ messenger }: { messenger: MessengerSettings }) => {
  const { t } = useTranslation('frontline');

  return (
    <SettingsCard
      title={t('messenger-install', 'Install')}
      description={t(
        'messenger-install-description',
        'Paste this line before </body> on every page that shows the messenger.',
      )}
    >
      <div className="sm:col-span-2">
        <InstallCode
          code={scriptTag(messenger.scriptUrl)}
          label={t('messenger-install-code', 'Messenger install code')}
        />
      </div>
      {messenger.canManage && (
        <IdentitySecret id={messenger.id} secret={messenger.identitySecret} />
      )}
    </SettingsCard>
  );
};
