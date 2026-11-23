import {
  IconBrandDiscord,
  IconBrandMeta,
  IconBrandTelegram,
  IconMail,
  IconPhone,
  IconPhoneCall,
} from '@tabler/icons-react';
import type { TIntegrationTab, TPluginIntegration } from 'erxes-ui';
import { lazy } from 'react';
import { withText } from '~/i18n/withText.ts';

// `./config` imports this, so like it, it holds only icons, names and lazy slots.

const accounts = withText(() => import('@/integrations/ProviderAccounts.tsx'));

/** An integration's Accounts tab, drawn by the `component` ProviderAccounts exports by that name. */
const accountsTab = (component: keyof Awaited<ReturnType<typeof accounts>>): TIntegrationTab => ({
  value: 'accounts',
  label: 'Accounts',
  component: lazy(async () => ({ default: (await accounts())[component] })),
});

/**
 * The tiles frontline adds to core's Settings › Integrations, which the manifest's
 * `integrations` declare: an organisation connects each one's accounts there once, and every
 * channel picks the ones that bring it conversations.
 */
export const INTEGRATION_TILES: TPluginIntegration[] = [
  {
    key: 'meta',
    icon: IconBrandMeta,
    tabs: [accountsTab('MetaAccounts')],
  },
  { key: 'telegram', icon: IconBrandTelegram, tabs: [accountsTab('TelegramAccounts')] },
  { key: 'discord', icon: IconBrandDiscord, tabs: [accountsTab('DiscordAccounts')] },
  { key: 'mail', icon: IconMail, tabs: [accountsTab('MailAccounts')] },
  { key: 'call', icon: IconPhone, tabs: [accountsTab('CallAccounts')] },
  { key: 'callpro', icon: IconPhoneCall, tabs: [accountsTab('CallProAccounts')] },
];
