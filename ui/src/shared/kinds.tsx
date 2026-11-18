import {
  type IconType,
  SiDiscord,
  SiFacebook,
  SiInstagram,
  SiMessenger,
  SiTelegram,
} from '@icons-pack/react-simple-icons';
import {
  type Icon,
  IconBrandDiscord,
  IconBrandFacebook,
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
 * Each kind's outline icon, for a panel row's label beside the other rows' outlines, and how it
 * shows where a conversation came from at a glance: a provider's own mark in its brand colour, as
 * the old inbox drew them, or the outline in a theme tint for frontline's own kinds.
 */
type KindLook = { icon: Icon } & (
  | { tint: string }
  | {
      mark: IconType;
      /** A shade of the brand that clears 3:1 on white, where its own doesn't. */
      color?: string;
    }
);

const KIND_ICONS: Record<string, KindLook> = {
  messenger: { icon: IconMessageCircle, tint: 'text-primary-text' },
  facebook: { icon: IconBrandMessenger, mark: SiMessenger },
  instagram: { icon: IconBrandInstagram, mark: SiInstagram },
  telegram: { icon: IconBrandTelegram, mark: SiTelegram, color: '#0088CC' },
  discord: { icon: IconBrandDiscord, mark: SiDiscord },
  mail: { icon: IconMail, tint: 'text-warning-text' },
  call: { icon: IconPhone, tint: 'text-success-text' },
  callpro: { icon: IconPhone, tint: 'text-success-text' },
};

/** A person's comments under a page's post, which the Facebook kind also carries. */
const FACEBOOK_POST: KindLook = { icon: IconBrandFacebook, mark: SiFacebook };

const UNKNOWN: KindLook = { icon: IconPlug, tint: 'text-muted-foreground' };

/**
 * Whether a kind's conversations take internal notes only, as the API's adapter says
 * (`notesOnly` in `api/src/modules/inbox/adapters.ts`): a phone call has no thread to answer in.
 */
export const takesNotesOnly = (kind: string) => kind === 'call' || kind === 'callpro';

/** The outline icon of an integration kind, for a panel row's label; a plug for one the UI doesn't know. */
export const kindIconOf = (kind: string) => (KIND_ICONS[kind] ?? UNKNOWN).icon;

/**
 * The mark of the integration kind a conversation came through. Its `thread`, the provider's id
 * for it, tells a Facebook comment thread (`comment:<post>:<author>`) from a Messenger chat.
 */
export const KindIcon = ({
  kind,
  thread,
  className,
}: {
  kind: string;
  thread?: string | null;
  className?: string;
}) => {
  const look =
    kind === 'facebook' && thread?.startsWith('comment:')
      ? FACEBOOK_POST
      : (KIND_ICONS[kind] ?? UNKNOWN);

  // An empty title, so the mark adds no tooltip of its own over the label beside it.
  if ('mark' in look)
    return <look.mark color={look.color ?? 'default'} title="" className={className} aria-hidden />;

  return <look.icon className={cn(look.tint, className)} aria-hidden />;
};
