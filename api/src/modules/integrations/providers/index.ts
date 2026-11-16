import type { Provider, ProviderName, WebhookSource } from '../provider.ts';
import { discord } from './discord.ts';
import { mail } from './mail.ts';
import { facebook, instagram } from './meta.ts';
import { metaWebhook } from './metaWebhook.ts';
import { telegram, telegramWebhook } from './telegram.ts';

const PROVIDERS: Record<ProviderName, Provider> = { facebook, instagram, telegram, discord, mail };

/** The provider of an account row. */
export const providerOf = (name: ProviderName) => PROVIDERS[name];

/** The webhooks at `/api/public/webhooks/<name>`. */
export const WEBHOOKS: Record<string, WebhookSource | undefined> = {
  meta: metaWebhook,
  telegram: telegramWebhook,
};
