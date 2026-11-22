import { useTranslation } from 'react-i18next';

/** The kinds that bring a channel conversations, in the order its settings list them. */
export const CHANNEL_KINDS = [
  'messenger',
  'facebook',
  'instagram',
  'telegram',
  'discord',
  'mail',
  'call',
  'callpro',
] as const;

/** Each kind's card title: short, as the hint under it says what it brings. */
export const useKindTitles = (): Record<string, string> => {
  const { t } = useTranslation('frontline');

  return {
    messenger: t('website-messenger', 'Website messenger'),
    facebook: t('facebook', 'Facebook'),
    instagram: t('kind-instagram', 'Instagram'),
    telegram: t('kind-telegram', 'Telegram'),
    discord: t('kind-discord', 'Discord'),
    mail: t('kind-mail', 'Email'),
    call: t('grandstream-pbx', 'Grandstream PBX'),
    callpro: t('kind-callpro', 'CallPro'),
  };
};

/** What each kind brings into a channel, in a line under its name. */
export const useKindHints = (): Record<string, string> => {
  const { t } = useTranslation('frontline');

  return {
    messenger: t('kind-hint-messenger', 'A chat box on your website or app.'),
    facebook: t('kind-hint-facebook', 'A page’s Messenger chats and post comments.'),
    instagram: t('kind-hint-instagram', 'An Instagram account’s direct messages.'),
    telegram: t('kind-hint-telegram', 'Chats with your Telegram bot.'),
    discord: t('kind-hint-discord', 'Messages to your Discord bot.'),
    mail: t('kind-hint-mail', 'A mailbox that receives and sends email.'),
    call: t('kind-hint-call', 'Calls through a Grandstream PBX.'),
    callpro: t('kind-hint-callpro', 'Calls through a CallPro line.'),
  };
};
