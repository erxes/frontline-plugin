import { PLUGIN } from '~/plugin.ts';

/**
 * The integration in core's Settings › Integrations whose accounts `provider` connects, as the
 * API's catalog declares them: Meta's login connects Facebook pages and Instagram accounts alike.
 */
const integrationKeyOf = (provider: string) =>
  provider === 'facebook' || provider === 'instagram' ? 'meta' : provider;

/** The page of `provider`'s integration in core's Settings › Integrations, on its accounts. */
export const integrationPage = (provider: string) =>
  `/settings/integrations/${PLUGIN}.${integrationKeyOf(provider)}?tab=accounts`;
