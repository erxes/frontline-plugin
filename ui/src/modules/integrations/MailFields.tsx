import {
  IconAt,
  IconLetterCase,
  IconLock,
  IconPlug,
  IconServer,
  IconUser,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { orpc } from '~/orpc.ts';
import { TextRow } from '~/shared/TextRow.tsx';

/** What each mail service asks of a mailbox that signs in with a password. */
const useSignInHints = () => {
  const { t } = useTranslation('frontline');

  return {
    google: t(
      'mail-hint-google',
      'Google takes an app password here: Google Account › Security › 2-Step Verification › App passwords.',
    ),
    microsoft: t(
      'mail-hint-microsoft',
      'Microsoft 365 turns off password sign-in for IMAP and SMTP until an admin allows it for this mailbox.',
    ),
    yahoo: t(
      'mail-hint-yahoo',
      'Yahoo takes an app password here, made under Account security › Generate app password.',
    ),
    apple: t(
      'mail-hint-apple',
      'iCloud takes an app-specific password here, made at appleid.apple.com › Sign-In and Security.',
    ),
    zoho: t(
      'mail-hint-zoho',
      'Turn on IMAP in Zoho Mail settings; with two-factor sign-in on, use an app password.',
    ),
    yandex: t(
      'mail-hint-yandex',
      'Turn on IMAP in Yandex Mail settings and use an app password from Yandex ID.',
    ),
  };
};

const Address = z.email();

/**
 * A mailbox: its address, the sender name on replies, and one login for both servers. Once the
 * address is typed, the servers fill in from where its domain's mail goes, and the password
 * says what that service takes.
 */
export const MailFields = () => {
  const { t } = useTranslation('frontline');
  const hints = useSignInHints();
  const [address, setAddress] = useState('');

  const servers = useQuery({
    ...orpc.integrations.mail.servers.queryOptions({ input: { address } }),
    enabled: Address.safeParse(address).success,
  }).data;

  return (
    <>
      <TextRow
        label={t('address', 'Address')}
        icon={IconAt}
        name="address"
        type="email"
        required
        onBlur={setAddress}
      />
      <TextRow label={t('sender-name', 'Sender name')} icon={IconLetterCase} name="name" required />
      <TextRow
        label={t('password', 'Password')}
        icon={IconLock}
        name="password"
        type="password"
        required
        hint={servers?.service && hints[servers.service]}
      />
      <TextRow
        label={t('user-name', 'User name')}
        icon={IconUser}
        name="user"
        placeholder={address}
        hint={t('mail-user-hint', 'Leave it empty to sign in with the address.')}
      />
      {/* A new domain's servers replace what the rows held. */}
      <Fragment key={servers?.imap.host}>
        <TextRow
          label={t('imap-host', 'IMAP host')}
          icon={IconServer}
          name="imapHost"
          defaultValue={servers?.imap.host}
          required
          hint={
            servers &&
            !servers.service &&
            t('mail-servers-guessed', 'Guessed from the address: check it with your mail provider.')
          }
        />
        <TextRow
          label={t('imap-port', 'IMAP port')}
          icon={IconPlug}
          name="imapPort"
          type="number"
          defaultValue={String(servers?.imap.port ?? 993)}
          required
        />
        <TextRow
          label={t('smtp-host', 'SMTP host')}
          icon={IconServer}
          name="smtpHost"
          defaultValue={servers?.smtp.host}
          required
        />
        <TextRow
          label={t('smtp-port', 'SMTP port')}
          icon={IconPlug}
          name="smtpPort"
          type="number"
          defaultValue={String(servers?.smtp.port ?? 465)}
          required
        />
      </Fragment>
    </>
  );
};
