import type { Provider, ProviderName, WebhookSource } from '../provider.ts';
import { call, callpro } from './call/call.ts';
import { discord } from './discord.ts';
import { mail } from './mail.ts';
import { telegram } from './telegram.ts';
import { telegramWebhook } from './telegramWebhook.ts';

const PROVIDERS: Record<ProviderName, Provider> = {
  telegram,
  discord,
  mail,
  call,
  callpro,
};

/** The provider of an account row. */
export const providerOf = (name: ProviderName) => PROVIDERS[name];

/** The webhooks at `/api/public/webhooks/<name>`. */
export const WEBHOOKS: Record<string, WebhookSource | undefined> = {
  telegram: telegramWebhook,
};
