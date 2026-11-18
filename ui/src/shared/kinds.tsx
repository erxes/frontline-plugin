import {
  type Icon,
  IconBrandDiscord,
  IconBrandInstagram,
  IconBrandMessenger,
  IconBrandTelegram,
  IconMail,
  IconMessageCircle,
  IconPhone,
  IconPlug,
} from '@tabler/icons-react';
import { cn } from 'erxes-ui';
import { useTranslation } from 'react-i18next';

/** What each integration kind reads as; a kind the UI doesn't know shows its name. */
export const useKindNames = (): Record<string, string> => {
  const { t } = useTranslation('frontline');

  return {
    messenger: t('kind-messenger', 'Messenger'),
    facebook: t('kind-facebook', 'Facebook Messenger'),
    instagram: t('kind-instagram', 'Instagram'),
    telegram: t('kind-telegram', 'Telegram'),
    discord: t('kind-discord', 'Discord'),
    mail: t('kind-mail', 'Email'),
    call: t('kind-call', 'Phone'),
    callpro: t('kind-callpro', 'CallPro'),
  };
};

/**
 * Each kind's icon, tinted as near its brand as the theme's tokens get, so a row says where a
 * conversation came from at a glance, as the old inbox's coloured icons did.
 */
const KIND_ICONS: Record<string, { icon: Icon; tint: string }> = {
  messenger: { icon: IconMessageCircle, tint: 'text-primary-text' },
  facebook: { icon: IconBrandMessenger, tint: 'text-info-text' },
  instagram: { icon: IconBrandInstagram, tint: 'text-destructive-text' },
  telegram: { icon: IconBrandTelegram, tint: 'text-info-text' },
  discord: { icon: IconBrandDiscord, tint: 'text-primary-text' },
  mail: { icon: IconMail, tint: 'text-warning-text' },
  call: { icon: IconPhone, tint: 'text-success-text' },
  callpro: { icon: IconPhone, tint: 'text-success-text' },
};

const UNKNOWN = { icon: IconPlug, tint: 'text-muted-foreground' };

/**
 * Whether a kind's conversations take internal notes only, as the API's adapter says
 * (`notesOnly` in `api/src/modules/inbox/adapters.ts`): a phone call has no thread to answer in.
 */
export const takesNotesOnly = (kind: string) => kind === 'call' || kind === 'callpro';

/** The untinted icon of an integration kind, for a panel row's label; a plug for one the UI doesn't know. */
export const kindIconOf = (kind: string) => (KIND_ICONS[kind] ?? UNKNOWN).icon;

/** The tinted icon of the integration kind a conversation came through. */
export const KindIcon = ({ kind, className }: { kind: string; className?: string }) => {
  const { icon: KindGlyph, tint } = KIND_ICONS[kind] ?? UNKNOWN;

  return <KindGlyph className={cn(tint, className)} aria-hidden />;
};
