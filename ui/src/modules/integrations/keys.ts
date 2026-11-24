import { PLUGIN } from '~/plugin.ts';

/**
 * The page of `provider`'s accounts in core's Settings › Integrations, as the API's catalog
 * declares them. Facebook pages and Instagram accounts connect through core's Facebook
 * connection, so their Accounts tab shows on core's Facebook page.
 */
export const integrationPage = (provider: string) =>
  provider === 'facebook' || provider === 'instagram'
    ? `/settings/integrations/facebook?tab=${PLUGIN}.meta.accounts`
    : `/settings/integrations/${PLUGIN}.${provider}?tab=accounts`;
